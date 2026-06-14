import { useEffect, useRef } from 'react'
import { useStore, DRILLABLE } from '../store'
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

      if (s.modal) {
        if (e.key === 'Escape') s.closeModal()
        return
      }

      // Port-forward dialog has its own inputs; only Esc is handled globally.
      if (s.pfModal) {
        if (e.key === 'Escape') s.closePortForward()
        return
      }

      if (s.helpOpen) {
        if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); s.setHelpOpen(false) }
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

      if (s.commandActive) {
        if (e.key === 'Enter')  { e.preventDefault(); s.submitCommand() }
        if (e.key === 'Escape') s.setCommandActive(false)
        return
      }

      if (s.filterActive) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault()
          s.setFilterActive(false)
          if (s.filter) s.setFilterPinned(true)
        }
        return
      }

      // Object actions from the registry (logs/describe/yaml/edit/decode, helm v/m/n/h,
      // ⇧f port-forward, ⇧j owner). Single source of truth in actions.js — keyed,
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
          e.preventDefault()
          s.setCommandActive(true)
          break

        case '/':
          e.preventDefault()
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
          if (s.nsPickerMode)              { s.exitNsPickerMode();          break }
          if (s.selectedIds.size > 0)      { s.clearMultiSelect();          break }
          if (s.selectedId)                { s.setSelected(null);           break }
          if (s.navStack.length)           { s.navBack();                   break }
          if (s.activeNamespace !== 'all') { s.setActiveNamespace('all');   break }
          if (s.filterPinned || s.filter)  { s.clearFilter();               break }
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
