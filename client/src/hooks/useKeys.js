import { useEffect, useRef } from 'react'
import { useStore, DRILLABLE, RBAC_RESOURCES } from '../store'
import { actionForKey, applicableActions } from '../actions'

function navigate(s, dir) {
  const items = s.getFilteredItems()
  if (!items.length) return
  const idx = items.findIndex(i => i.id === s.selectedId)
  const next = dir === 1
    ? (idx + 1) % items.length
    : (idx - 1 + items.length) % items.length
  s.setSelected(items[next].id)
}

export function useKeys() {
  const lastGRef = useRef(0)

  useEffect(() => {
    function onKey(e) {
      const s = useStore.getState()

      // Auth gate (task 97): the login screen owns the keyboard (typing a token must not trigger
      // shortcuts). The app tree isn't even mounted while it's up, so there's nothing to drive.
      if (s.authRequired && !s.authed) return

      if (s.modal) {
        if (e.key === 'Escape') s.closeModal()
        return
      }

      // Port-forward dialog has its own inputs; only Esc is handled globally.
      if (s.pfModal) {
        if (e.key === 'Escape') s.closePortForward()
        return
      }

      // The shell terminal owns the keyboard entirely (every key goes to xterm, including
      // Esc - vim etc. need it). ExecModal closes via its own × button / shell exit (#81).
      if (s.execModal) return

      // The debug dialog (#82) has its own image input + Esc handling; yield the keyboard.
      if (s.debugModal) { if (e.key === 'Escape') s.closeDebug(); return }

      // The copy dialog (#108) has its own path / file inputs; yield the keyboard, handle Esc.
      if (s.cpModal) { if (e.key === 'Escape') s.closeCp(); return }

      // The S3 copy dialog (module #2) has its own inputs; yield the keyboard, handle Esc.
      if (s.s3CpModal) { if (e.key === 'Escape') s.closeS3Cp(); return }

      // The AWS related-resources view (phase 1) owns the keyboard via its own capture-phase
      // listener (j/k select, Enter jump, / filter, Esc close); yield entirely while it's open.
      if (s.relatedModal) return

      if (s.helpOpen) {
        if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); s.setHelpOpen(false) }
        return
      }

      // Theme picker owns the keyboard while open (its own capture-phase listener).
      if (s.themePickerOpen) return

      // Shift+T: open the theme picker
      if (e.key === 'T') {
        e.preventDefault()
        s.openThemePicker()
        return
      }

      // Actions palette owns the keyboard while open (its own capture-phase listener).
      if (s.actionMenuOpen) return

      if (s.deleteConfirm) return

      // ?: open shortcuts help
      if (e.key === '?') {
        e.preventDefault()
        s.setHelpOpen(true)
        return
      }

      // ctrl+b: toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        s.toggleSidebar()
        return
      }

      // ctrl+\: toggle the right detail drawer on/off (wide mode)
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault()
        s.togglePanel()
        return
      }

      // ctrl+z: toggle faults-only view
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        s.toggleFaults()
        return
      }

      // ctrl+g: toggle namespace grouping (flat list ⇄ grouped headers)
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        s.toggleGroupByNamespace()
        return
      }

      // ctrl+y: toggle the history trail's visibility (show/hide). ctrl+shift+y clears it.
      // Placed before the object-action dispatch so it doesn't collide with `y` (= yaml). (#22)
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        if (e.shiftKey) s.clearHistory()
        else s.toggleHistory()
        return
      }

      // ctrl+k: instant kill, no confirmation (multi-select aware)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        s.killSelected()
        return
      }

      // ctrl+d: delete with confirmation (multi-select aware)
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        s.requestDelete()
        return
      }

      // The top-right search box (string or resource mode) owns its own keys while focused.
      if (s.filterActive) return

      // Object actions from the registry (logs/describe/yaml/edit/decode, helm v/m/n/h,
      // ⇧f port-forward, ⇧j owner). Single source of truth in actions.js - keyed,
      // non-danger actions are dispatched here so a new action needs no change to this file.
      if (s.selectedId) {
        const action = actionForKey(e, s.activeResource)
        if (action && !action.danger) {
          e.preventDefault()
          action.run(s)
          return
        }
      }

      switch (e.key) {
        case ':':
          // Resource-filter mode in the top-right box (replaces the old bottom command bar).
          e.preventDefault()
          s.setFilterMode('res')
          s.setFilterActive(true)
          break

        case '/':
          // String-filter mode in the top-right box.
          e.preventDefault()
          s.setFilterMode('str')
          s.setFilterActive(true)
          break

        // a: open the actions palette for the selected object
        case 'a':
          if (s.selectedId && applicableActions(s.activeResource).length) { e.preventDefault(); s.openActionMenu() }
          break

        case 'G':
          if (!e.ctrlKey) {
            e.preventDefault()
            const items = s.getFilteredItems()
            if (items.length) s.setSelected(items[items.length - 1].id)
          }
          break

        case 'g': {
          if (!e.ctrlKey && !e.metaKey) {
            const now = Date.now()
            if (now - lastGRef.current < 400) {
              e.preventDefault()
              const items = s.getFilteredItems()
              if (items.length) s.setSelected(items[0].id)
            }
            lastGRef.current = now
          }
          break
        }

        case 'j':
        case 'Tab':
        case 'ArrowDown':
          e.preventDefault()
          navigate(s, 1)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          navigate(s, -1)
          break

        // k9s-style sort shortcuts (Shift+N/A/S); repeat toggles direction
        case 'N':
          e.preventDefault()
          s.setSort('name')
          break
        case 'A':
          e.preventDefault()
          s.setSort('age')
          break
        case 'S':
          e.preventDefault()
          s.setSort('status')
          break

        case 'Enter': {
          e.preventDefault()
          if (!s.selectedId) break

          // Namespace picker: Enter selects the namespace
          if (s.nsPickerMode) {
            const ns = (s.namespaces || []).find(n => n.id === s.selectedId)
            if (ns) s.exitNsPickerMode(ns.name)
            break
          }

          // CRD list: Enter jumps to that definition's custom resources (#20)
          if (s.activeResource === 'crds') {
            const crd = s.getFilteredItems().find(i => i.id === s.selectedId)
            if (crd) s.fetchCrdResources(crd.group, crd.version, crd.plural)
            break
          }

          // RBAC objects: Enter opens the k9s-style policy / rules view (task 94)
          if (RBAC_RESOURCES.has(s.activeResource)) {
            s.openModal('policy')
            break
          }

          // S3 buckets: Enter drills into the bucket's objects. Async + fetched (not embedded), so
          // it can't use getDrillTarget - handled before the generic DRILLABLE path (module #2).
          if (s.activeResource === 's3buckets') {
            const item = s.getFilteredItems().find(i => i.id === s.selectedId)
            if (item) s.drillIntoBucket(item)
            break
          }

          // Other AWS resources: nothing to drill into (no embedded children), so Enter opens the
          // inspect modal - the AWS analog of describe/yaml (module #2). Mirrors the s3buckets
          // special-case above; sits before the generic k8s DRILLABLE block.
          if (s.activeProvider === 'aws') {
            s.openModal('aws-inspect')
            break
          }

          // Drill-down into related resources
          if (DRILLABLE.has(s.activeResource)) {
            const item = s.getFilteredItems().find(i => i.id === s.selectedId)
            if (item) {
              const target = s.getDrillTarget(item)
              if (target) s.drillDown(target)
            }
          }
          break
        }

        case '[':
          e.preventDefault()
          s.navBack()
          break
        case ']':
          e.preventDefault()
          s.navForwardStep()
          break

        case ' ':
          e.preventDefault()
          if (s.selectedId) s.toggleMultiSelect(s.selectedId)
          break

        case 'Escape':
          // Esc steps back through *view* state only - it never pops the history/nav stack
          // (#22). Use `[` / `]` (or the footer trail) to navigate history explicitly.
          if (s.nsPickerMode)              { s.exitNsPickerMode();          break }
          if (s.selectedIds.size > 0)      { s.clearMultiSelect();          break }
          if (s.selectedId)                { s.setSelected(null);           break }
          if (s.activeNamespace !== 'all') { s.setActiveNamespace('all');   break }
          if (s.filterPinned || s.filter)  { s.clearFilter();               break }
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
