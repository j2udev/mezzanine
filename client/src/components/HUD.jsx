import { useRef, useEffect, useMemo } from 'react'
import { alpha } from '../theme'
import { useStore, RESOURCE_ALIASES } from '../store'
import { DetailPanel } from './DetailPanel'
import { ActionModal } from './ActionModal'
import { PortForwardModal } from './PortForwardModal'
import { ExecModal } from './ExecModal'
import { HelpModal } from './HelpModal'
import { ActionMenu } from './ActionMenu'

// Built-in resource names the `:` resource picker can autocomplete/cycle through (Tab). The
// canonical resource names (deduped alias targets) plus the `ns` namespace-picker shortcut.
// Live CRDs are folded in at render time (#20) so the picker can also find custom resources.
const COMMAND_OPTIONS = [...new Set([...Object.values(RESOURCE_ALIASES), 'ns'])].sort()

// canonical name → every alias that resolves to it (incl. the canonical itself), so the
// resource dropdown can match what the user types even when it's a short alias (e.g. "svc").
const ALIASES_FOR = (() => {
  const m = { ns: ['ns', 'namespace'] }
  for (const [alias, canon] of Object.entries(RESOURCE_ALIASES)) (m[canon] ||= [canon]).push(alias)
  return m
})()
// Rank score for an alias list against the typed stem: [tier, length]. Lower sorts first.
// tier 0 = an alias equals the stem (exact), 1 = an alias starts with it (prefix),
// 2 = an alias merely contains it (substring), Infinity tier = no match. `length` is the
// shortest matching alias, so the most-direct/sane completion wins (":po" → "pods", not
// "pdb" via "poddisruptionbudget"). #77
const aliasScore = (aliases, stem) => {
  if (!stem) return [1, Math.min(...aliases.map(a => a.length))]
  let prefix = Infinity, sub = Infinity
  for (const a of aliases) {
    if (a === stem) return [0, a.length]
    if (a.startsWith(stem)) prefix = Math.min(prefix, a.length)
    else if (a.includes(stem)) sub = Math.min(sub, a.length)
  }
  if (prefix !== Infinity) return [1, prefix]
  if (sub !== Infinity)    return [2, sub]
  return [Infinity, Infinity]
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 3,
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      color: 'var(--mz-text-dim)', fontFamily: 'inherit', fontSize: 10,
    }}>
      {children}
    </span>
  )
}

function Hint({ keys, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {keys.map(k => <Kbd key={k}>{k}</Kbd>)}
      <span style={{ fontSize: 10, color: 'var(--mz-accent-2)' }}>{label}</span>
    </div>
  )
}

export function HUD({ panelWidth = 288 }) {
  const activeResource  = useStore(s => s.activeResource)
  const activeNamespace = useStore(s => s.activeNamespace)
  const demoMode        = useStore(s => s.demoMode)
  const filter          = useStore(s => s.filter)
  const filterActive    = useStore(s => s.filterActive)
  const filterMode      = useStore(s => s.filterMode)
  const command         = useStore(s => s.command)
  const selectedId      = useStore(s => s.selectedId)
  const selectedIds     = useStore(s => s.selectedIds)
  const navStack        = useStore(s => s.navStack)
  const navFuture       = useStore(s => s.navFuture)
  const drilldownLabel  = useStore(s => s.drilldownLabel)
  const nsPickerMode    = useStore(s => s.nsPickerMode)
  const sortKey         = useStore(s => s.sortKey)
  const sortDir         = useStore(s => s.sortDir)
  const faultsOnly      = useStore(s => s.faultsOnly)
  const toggleFaults    = useStore(s => s.toggleFaults)
  const clearSort       = useStore(s => s.clearSort)
  const groupByNamespace        = useStore(s => s.groupByNamespace)
  const toggleGroupByNamespace  = useStore(s => s.toggleGroupByNamespace)
  const panelEnabled            = useStore(s => s.panelEnabled)
  const togglePanel             = useStore(s => s.togglePanel)
  const sidebarCollapsed        = useStore(s => s.sidebarCollapsed)
  const toggleSidebar           = useStore(s => s.toggleSidebar)

  const setActiveNamespace  = useStore(s => s.setActiveNamespace)
  const setFilter           = useStore(s => s.setFilter)
  const setFilterActive     = useStore(s => s.setFilterActive)
  const setFilterMode       = useStore(s => s.setFilterMode)
  const clearFilter         = useStore(s => s.clearFilter)
  const setCommand          = useStore(s => s.setCommand)
  const submitCommand       = useStore(s => s.submitCommand)
  const navGo               = useStore(s => s.navGo)

  const filterRef  = useRef()
  // Resource-mode Tab-autocomplete: stem = what the user typed before the first Tab, idx =
  // where we are in the candidate cycle. Reset on every keystroke so typing restarts the cycle.
  const acStemRef  = useRef(null)
  const acIdxRef   = useRef(-1)

  // Focus the box when it goes active; select-all so a fresh `/` or `:` replaces stale text.
  useEffect(() => {
    if (filterActive) { filterRef.current?.focus(); filterRef.current?.select() }
  }, [filterActive])

  // Live CRDs fold into the resource picker's candidate pool (#20).
  const crds = useStore(s => s.crds)

  // Items for count/filter display (handles drilldown and cr: prefix)
  const crdResources = useStore(s => s.crdResources)
  const drilldownItems = useStore(s => s.drilldownItems)
  const storeItems   = useStore(s => s[activeResource])
  const allItems = drilldownItems
    || (activeResource.startsWith('cr:') ? (crdResources[activeResource.slice(3)] || []) : (storeItems || []))

  const filteredCount = useMemo(() => {
    let items = allItems
    if (activeNamespace !== 'all') items = items.filter(i => i.namespace === activeNamespace)
    if (!filter) return items.length
    const q = filter.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || (i.namespace || '').toLowerCase().includes(q)
    ).length
  }, [allItems, filter, activeNamespace])

  const totalCount = allItems.length
  const resourceLabel = drilldownLabel
    ? drilldownLabel.split('›').pop().trim()
    : activeResource.startsWith('cr:') ? activeResource.slice(3).split('/').pop() : activeResource

  // ── Resource-filter mode (#70): the box switches the active resource ──────────
  const resMode = filterMode === 'res'

  // The full candidate set the resource picker can match: built-in resources (each carrying
  // its alias list for matching) plus every live CRD (#20). A CRD candidate submits its
  // `cr:group/version/plural` key (what fetchCrdResources / submitCommand expects) and is
  // matched on its kind, plural, and full name so typing any of them surfaces it.
  const candidatePool = useMemo(() => {
    const builtin = COMMAND_OPTIONS.map(n => ({
      value: n, label: n === 'ns' ? 'namespace (picker)' : n,
      sublabel: '', aliases: ALIASES_FOR[n] || [n], isCrd: false,
    }))
    const custom = (crds || []).map(c => ({
      value: `cr:${c.group}/${c.version}/${c.plural}`,
      label: c.kind, sublabel: c.group, isCrd: true,
      aliases: [c.kind, c.plural, c.name].map(a => a.toLowerCase()),
    }))
    return [...builtin, ...custom]
  }, [crds])

  // Candidates for the resource dropdown, ranked by typed text. Matching is alias-aware
  // (typing "svc" surfaces "services", "cert" surfaces Certificate); prefix matches rank first.
  const rankCandidates = (stem) => candidatePool
    .map(c => ({ c, score: aliasScore(c.aliases, stem) }))
    .filter(({ score }) => score[0] !== Infinity)
    .sort((a, b) => {
      if (a.score[0] !== b.score[0]) return a.score[0] - b.score[0]   // exact → prefix → substring
      if (a.score[1] !== b.score[1]) return a.score[1] - b.score[1]   // shortest matching alias first
      return a.c.label.localeCompare(b.c.label)
    })
    .map(({ c }) => c)
  const resCandidates = useMemo(() => rankCandidates(command.trim().toLowerCase()), [command, candidatePool])

  // Tab completes/cycles through the candidates. The stem (text typed before the first Tab)
  // is held in acStemRef so repeated Tabs cycle off the original input. Shift+Tab reverses.
  // We fill the box with the candidate's label (readable); Enter/click submits its value.
  const cycleCommand = (dir) => {
    if (acStemRef.current == null) { acStemRef.current = command; acIdxRef.current = -1 }
    const cands = rankCandidates(acStemRef.current.trim().toLowerCase())
    if (!cands.length) return
    acIdxRef.current = (acIdxRef.current + dir + cands.length) % cands.length
    setCommand(cands[acIdxRef.current].label)
  }

  // Toggle the box between string-filter and resource-filter modes (re-focuses).
  const toggleBoxMode = () => {
    const next = resMode ? 'str' : 'res'
    setFilterMode(next)
    setFilterActive(true)
    if (next === 'res') { setCommand(''); acStemRef.current = null; acIdxRef.current = -1 }
  }

  // Pick a resource candidate (Enter on the input, or click in the dropdown). Accepts either a
  // candidate object (dropdown / top-match) or a raw string (typed text passed straight through).
  const pickResource = (cand) => {
    const value = typeof cand === 'string' ? cand : cand.value
    if (submitCommand(value)) filterRef.current?.blur()
  }

  const showBreadcrumb = navStack.length > 0 || !!drilldownLabel
  // A history frame's label = its drilldown leaf (last "›" segment) or its plain resource name.
  const crumbLabel = (f) => f.drilldownLabel ? f.drilldownLabel.split('›').pop().trim() : f.resource

  // Carousel cap (#todo4): the trail is one ordered list - past frames, the current view,
  // then forward (future) frames. We show at most MAX_CRUMBS of them; when there are more,
  // the overflow on the LEFT (oldest history) collapses into a single clickable "⋯" that
  // jumps to the very start of the trail. Slicing the rightmost MAX_CRUMBS keeps the current
  // view and the most-recent context visible.
  // 5 visual slots total. When the trail overflows, the leftmost slot becomes the ⋯, so we
  // show ⋯ + the (MAX_CRUMBS - 1) most-recent crumbs.
  const MAX_CRUMBS = 5
  const trail = [
    ...navStack.map((f, i) => ({
      key: `b${i}`, label: crumbLabel(f), title: 'back',
      onClick: () => navGo(-(navStack.length - i)),
      color: 'var(--mz-accent-2)', opacity: 1, weight: 400,
    })),
    {
      key: 'cur', label: drilldownLabel || activeResource, title: null, onClick: null,
      color: 'var(--mz-text)', opacity: 1, weight: 500,
    },
    ...navFuture.map((f, j) => ({
      key: `f${j}`, label: crumbLabel(f), title: 'forward',
      onClick: () => navGo(j + 1),
      color: 'var(--mz-accent-2)', opacity: 0.7, weight: 400,
    })),
  ]
  // When overflowing, the ⋯ occupies one slot, leaving MAX_CRUMBS - 1 for real crumbs.
  const overflowing = trail.length > MAX_CRUMBS
  const visibleCount = overflowing ? MAX_CRUMBS - 1 : MAX_CRUMBS
  const hiddenCount = Math.max(0, trail.length - visibleCount)
  const shownTrail = trail.slice(hiddenCount)

  // The grouping toggle only matters for namespaced resources viewed across all namespaces.
  const namespacedView = activeNamespace === 'all' && !nsPickerMode && allItems.some(i => i.namespace)

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 44,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
          background: 'linear-gradient(180deg, rgba(var(--mz-surface-rgb),0.97) 0%, rgba(var(--mz-surface-rgb),0) 100%)',
          borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.06)',
        }}
      >
        {/* Brand wordmark - doubles as the sidebar collapse toggle (#13). It morphs to the
            compact "mezza9" when the sidebar is collapsed, so the logo itself is the toggle
            and its state is the visual indication of whether the sidebar is open. */}
        <span
          onClick={toggleSidebar}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSidebar() } }}
          title={sidebarCollapsed ? 'Expand sidebar (ctrl+b)' : 'Collapse sidebar (ctrl+b)'}
          className="mezz-wordmark"
          style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, paddingRight: 4, cursor: 'pointer', userSelect: 'none' }}
        >
          {sidebarCollapsed ? 'mezza9' : 'mezzanine'}
        </span>

        {/* Demo-mode badge (no live cluster - the NotConnected screen covers "disconnected") */}
        {demoMode && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(var(--mz-warn-rgb), 0.67)', flexShrink: 0 }}>DEMO</span>
        )}

        {/* Namespace pill */}
        {activeNamespace !== 'all' && !nsPickerMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
            background: 'rgba(var(--mz-accent-rgb),0.1)', border: '1px solid rgba(var(--mz-accent-rgb),0.3)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--mz-accent-2)' }}>ns:</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent)', fontFamily: 'inherit' }}>{activeNamespace}</span>
            <button onClick={() => setActiveNamespace('all')} style={{ fontSize: 12, lineHeight: 1, color: 'var(--mz-text-dim)', marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => e.target.style.color = 'var(--mz-text)'} onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}>×</button>
          </div>
        )}

        {/* Namespace picker badge */}
        {nsPickerMode && (
          <span style={{
            fontSize: 10, letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 4, flexShrink: 0,
            color: 'var(--mz-warn)', background: 'rgba(var(--mz-warn-rgb),0.1)', border: '1px solid rgba(var(--mz-warn-rgb),0.3)',
          }}>
            SELECT NAMESPACE
          </span>
        )}

        {/* Center slot - the current (filtered) resource the list is showing, absolutely
            centered (#73). Always shown: the history/breadcrumb trail lives in the FOOTER
            now (kept separate from "what am I looking at" per user request), so this stays
            stable regardless of nav depth. `resourceLabel` already resolves to the active
            drilldown's leaf, so a drilled-in view names that resource here. */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, height: 44, transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', maxWidth: '40%', pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--mz-text-bright)', letterSpacing: '0.02em',
              textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {resourceLabel}
            </span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {filter ? `${filteredCount}/${totalCount}` : totalCount}
            </span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Search box - top-right. `/` = string filter, `:` = resource picker (#68, #70).
            A mode toggle lets mouse users switch without shortcuts; resource mode adds a
            dropdown of all resources with autocomplete. */}
        {(() => {
          const accent = resMode ? 'var(--mz-alt)' : 'var(--mz-accent)'
          const hasVal = resMode ? !!command : !!filter
          return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 6px 3px 4px', borderRadius: 4, transition: 'all 0.15s',
            background: hasVal ? `${alpha(accent, 10)}` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hasVal ? `${alpha(accent, 30)}` : 'rgba(255,255,255,0.1)'}`,
          }}>
            {/* str/res mode toggle */}
            <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
              {[{ m: 'str', l: '/', t: 'String filter (/)' }, { m: 'res', l: ':', t: 'Resource picker (:)' }].map(({ m, l, t }) => (
                <button key={m} title={t}
                  onClick={() => { if (filterMode !== m) toggleBoxMode(); else { setFilterActive(true); filterRef.current?.focus() } }}
                  style={{
                    fontSize: 11, fontWeight: 'bold', lineHeight: 1, padding: '2px 6px', cursor: 'pointer',
                    fontFamily: 'inherit', border: 'none', transition: 'all 0.12s',
                    color: filterMode === m ? (m === 'res' ? 'var(--mz-alt)' : 'var(--mz-accent)') : '#456',
                    background: filterMode === m ? (m === 'res' ? 'rgba(var(--mz-alt-rgb),0.18)' : 'rgba(var(--mz-accent-rgb),0.18)') : 'transparent',
                  }}>{l}</button>
              ))}
            </div>
            <input
              ref={filterRef}
              value={resMode ? command : filter}
              onChange={e => {
                if (resMode) { acStemRef.current = null; acIdxRef.current = -1; setCommand(e.target.value) }
                else setFilter(e.target.value)
              }}
              onFocus={() => setFilterActive(true)}
              onBlur={() => {
                // Delay so a dropdown click registers before the box deactivates.
                setTimeout(() => setFilterActive(false), 120)
                if (!resMode) useStore.getState().setFilterPinned(!!filter)
              }}
              onKeyDown={e => {
                if (resMode && e.key === 'Tab') { e.preventDefault(); cycleCommand(e.shiftKey ? -1 : 1); return }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Submit the exact typed text when it's a known alias (so the user can type a
                  // canonical name and bypass the ranking); otherwise submit the top candidate
                  // object (which may be a built-in resource or a CRD), falling back to the
                  // raw text so an unknown entry still routes through submitCommand.
                  if (resMode) {
                    const typed = command.trim().toLowerCase()
                    pickResource(RESOURCE_ALIASES[typed] ? typed : (resCandidates[0] || typed))
                  } else filterRef.current?.blur()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  if (resMode) { setCommand(''); setFilterMode('str') }
                  else if (filter) clearFilter()
                  filterRef.current?.blur()
                }
              }}
              placeholder={resMode ? 'resource…' : 'filter…'}
              style={{
                width: 150, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--mz-text-bright)', fontSize: 11, fontFamily: 'inherit',
              }}
            />
            {!resMode && filter && (
              <span style={{ fontSize: 10, color: 'var(--mz-accent-2)', flexShrink: 0 }}>{filteredCount}/{totalCount}</span>
            )}
            {hasVal && (
              <button onClick={() => { if (resMode) { setCommand(''); filterRef.current?.focus() } else clearFilter() }} title="Clear"
                style={{ fontSize: 12, lineHeight: 1, color: 'var(--mz-text-mid)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                onMouseEnter={e => e.target.style.color = 'var(--mz-text)'} onMouseLeave={e => e.target.style.color = 'var(--mz-text-mid)'}>×</button>
            )}
          </div>

          {/* Resource dropdown */}
          {resMode && filterActive && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 220, maxHeight: 280, overflowY: 'auto',
              background: 'rgba(var(--mz-backdrop-rgb),0.99)', border: '1px solid rgba(var(--mz-alt-rgb),0.3)', borderRadius: 5,
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 60, padding: '4px 0',
            }}>
              {resCandidates.length === 0 && (
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--mz-text-dim)' }}>no match</div>
              )}
              {resCandidates.map(cand => {
                const isActive = activeResource === cand.value
                return (
                  <div key={cand.value}
                    onMouseDown={e => { e.preventDefault(); pickResource(cand) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '4px 12px', cursor: 'pointer', fontSize: 11,
                      color: isActive ? 'var(--mz-alt)' : 'var(--mz-text-mid)',
                      background: isActive ? 'rgba(var(--mz-alt-rgb),0.15)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ textTransform: cand.isCrd ? 'none' : 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cand.label}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {cand.isCrd && (
                        <span style={{ fontSize: 9, color: 'var(--mz-text-faint)', fontFamily: 'monospace' }}>
                          {cand.sublabel.split('.')[0]}
                        </span>
                      )}
                      {cand.isCrd && <span style={{ fontSize: 8, color: 'var(--mz-alt)', letterSpacing: '0.06em' }}>CRD</span>}
                      {isActive && <span style={{ fontSize: 9, color: 'var(--mz-alt)' }}>● current</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
          )
        })()}

        {/* Namespace grouping toggle (flat list ⇄ grouped headers) */}
        {namespacedView && (
          <button
            onClick={toggleGroupByNamespace}
            title="Toggle namespace grouping (ctrl+g)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 4, fontSize: 10, letterSpacing: '0.04em',
              fontFamily: 'inherit',
              color: groupByNamespace ? 'var(--mz-accent)' : 'var(--mz-accent-2)',
              background: groupByNamespace ? 'rgba(var(--mz-accent-rgb),0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${groupByNamespace ? 'rgba(var(--mz-accent-rgb),0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}
            onMouseEnter={e => { if (!groupByNamespace) e.currentTarget.style.color = 'var(--mz-accent-2)' }}
            onMouseLeave={e => { if (!groupByNamespace) e.currentTarget.style.color = 'var(--mz-accent-2)' }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>{groupByNamespace ? '⊟' : '≡'}</span>
            {groupByNamespace ? 'grouped' : 'flat'}
          </button>
        )}

        {/* Detail-drawer on/off toggle (#todo3). Off = the right panel never opens, even on
            selection, giving the list its full width. State persists across reloads. */}
        <button
          onClick={togglePanel}
          title="Toggle detail drawer (ctrl+\\)"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer',
            padding: '2px 8px', borderRadius: 4, fontSize: 10, letterSpacing: '0.04em',
            fontFamily: 'inherit',
            color: panelEnabled ? 'var(--mz-accent)' : 'var(--mz-accent-2)',
            background: panelEnabled ? 'rgba(var(--mz-accent-rgb),0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${panelEnabled ? 'rgba(var(--mz-accent-rgb),0.3)' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>{panelEnabled ? '◧' : '▭'}</span>
          {panelEnabled ? 'drawer' : 'wide'}
        </button>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────── */}
      {panelEnabled && selectedId && <DetailPanel width={panelWidth} />}

      {/* ── Action modal ─────────────────────────────────────────── */}
      <ActionModal />

      {/* ── Port-forward modal ───────────────────────────────────── */}
      <PortForwardModal />

      {/* ── Shell terminal (#81) ─────────────────────────────────── */}
      <ExecModal />

      {/* ── Help modal ───────────────────────────────────────────── */}
      <HelpModal />

      {/* ── Actions palette ──────────────────────────────────────── */}
      <ActionMenu />

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
          background: 'linear-gradient(0deg, rgba(var(--mz-surface-rgb),0.97) 0%, rgba(var(--mz-surface-rgb),0) 100%)',
          borderTop: '1px solid rgba(var(--mz-accent-rgb),0.06)',
        }}
      >
        {(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {/* Bare-minimum shortcut hints (#72) - everything else lives in the ? help modal */}
            <Hint keys={['j', 'k']} label="select" />
            <Hint keys={[':']} label="resource" />
            <Hint keys={['/']} label="filter" />
            <Hint keys={['?']} label="help" />
            {/* State pills (not shortcut spam) stay so the user can see/clear active modes */}
            {selectedIds?.size > 0 && (
              <span style={{ fontSize: 10, color: 'var(--mz-warn-2)', background: 'rgba(var(--mz-warn-2-rgb),0.1)', border: '1px solid rgba(var(--mz-warn-2-rgb),0.3)', borderRadius: 3, padding: '1px 6px' }}>
                {selectedIds.size} marked
              </span>
            )}
            {sortKey && (
              <span
                onClick={clearSort}
                title="Clear sort"
                style={{ cursor: 'pointer', fontSize: 10, color: 'var(--mz-accent)', background: 'rgba(var(--mz-accent-rgb),0.1)', border: '1px solid rgba(var(--mz-accent-rgb),0.3)', borderRadius: 3, padding: '1px 6px' }}
              >
                sort: {sortKey} {sortDir === 'asc' ? '▲' : '▼'} <span style={{ opacity: 0.5 }}>×</span>
              </span>
            )}
            {faultsOnly && (
              <span
                onClick={toggleFaults}
                title="Show all (ctrl+z)"
                style={{ cursor: 'pointer', fontSize: 10, color: 'var(--mz-danger)', background: 'rgba(var(--mz-danger-rgb),0.12)', border: '1px solid rgba(var(--mz-danger-rgb),0.4)', borderRadius: 3, padding: '1px 6px' }}
              >
                faults only <span style={{ opacity: 0.6 }}>×</span>
              </span>
            )}
          </div>
        )}

        {/* History / breadcrumb trail - takes the whole middle of the FOOTER (flex:1) so the
            FULL stack is visible, not just the immediate prev/next. Each crumb is clickable and
            jumps straight to its point in history via navGo(delta). Kept distinct from the
            header's "current resource" indicator (per user request). Scrolls horizontally if
            the trail outgrows the available width. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
          {showBreadcrumb && (
            <div style={{
              display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%',
              background: 'rgba(var(--mz-accent-rgb),0.04)', border: '1px solid rgba(var(--mz-accent-rgb),0.1)',
              borderRadius: 4, padding: '2px 8px', fontSize: 10, whiteSpace: 'nowrap',
              overflowX: 'auto', overflowY: 'hidden',
            }}>
              {/* Overflow ⋯ - the leftmost crumb when the trail exceeds MAX_CRUMBS. Clicking it
                  jumps all the way back to the oldest frame (carousel cap, #todo4). */}
              {hiddenCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <span
                    onClick={() => navGo(-navStack.length)}
                    title={`${hiddenCount} more - jump to start`}
                    style={{ color: 'var(--mz-accent-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ⋯
                  </span>
                  <span style={{ color: 'var(--mz-text-faint)', padding: '0 4px' }}>›</span>
                </span>
              )}
              {/* The capped trail: past → current → future, separated by › */}
              {shownTrail.map((c, i) => (
                <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  {i > 0 && <span style={{ color: 'var(--mz-text-faint)', padding: '0 4px' }}>›</span>}
                  <span
                    onClick={c.onClick || undefined}
                    title={c.title || undefined}
                    style={{
                      color: c.color, opacity: c.opacity, fontWeight: c.weight,
                      cursor: c.onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 10, flexShrink: 0, color: 'var(--mz-text-dim)', fontFamily: 'inherit' }}>
          {filteredCount}&nbsp;<span style={{ color: 'var(--mz-text-faint)' }}>/</span>&nbsp;{totalCount}&nbsp;{resourceLabel}
        </div>
      </div>
    </>
  )
}
