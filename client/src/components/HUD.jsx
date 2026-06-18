import { useRef, useEffect, useMemo } from 'react'
import { alpha } from '../theme'
import { useStore, RESOURCE_ALIASES } from '../store'
import { DetailPanel } from './DetailPanel'
import { ActionModal } from './ActionModal'
import { PortForwardModal } from './PortForwardModal'
import { ExecModal } from './ExecModal'
import { HelpModal } from './HelpModal'
import { ActionMenu } from './ActionMenu'

// Resource names the `:` resource picker can autocomplete/cycle through (Tab). The canonical
// resource names (deduped alias targets) plus the `ns` namespace-picker shortcut.
const COMMAND_OPTIONS = [...new Set([...Object.values(RESOURCE_ALIASES), 'ns'])].sort()

// canonical name → every alias that resolves to it (incl. the canonical itself), so the
// resource dropdown can match what the user types even when it's a short alias (e.g. "svc").
const ALIASES_FOR = (() => {
  const m = { ns: ['ns', 'namespace'] }
  for (const [alias, canon] of Object.entries(RESOURCE_ALIASES)) (m[canon] ||= [canon]).push(alias)
  return m
})()
// Rank score for an option against the typed stem: [tier, length]. Lower sorts first.
// tier 0 = an alias equals the stem (exact), 1 = an alias starts with it (prefix),
// 2 = an alias merely contains it (substring), Infinity tier = no match. `length` is the
// shortest matching alias, so the most-direct/sane completion wins (":po" → "pods", not
// "pdb" via "poddisruptionbudget"). #77
const aliasScore = (opt, stem) => {
  const aliases = ALIASES_FOR[opt] || [opt]
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
const aliasMatch = (opt, stem) => aliasScore(opt, stem)[0] !== Infinity

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

  // Candidates for the resource dropdown, ranked by typed text. Matching is alias-aware
  // (typing "svc" surfaces "services"); prefix matches rank first.
  const rankCandidates = (stem) => COMMAND_OPTIONS
    .filter(n => aliasMatch(n, stem))
    .sort((a, b) => {
      const [at, al] = aliasScore(a, stem), [bt, bl] = aliasScore(b, stem)
      if (at !== bt) return at - bt        // exact → prefix → substring
      if (al !== bl) return al - bl        // shortest matching alias first
      return a.localeCompare(b)
    })
  const resCandidates = useMemo(() => rankCandidates(command.trim().toLowerCase()), [command])

  // Tab completes/cycles through the candidates. The stem (text typed before the first Tab)
  // is held in acStemRef so repeated Tabs cycle off the original input. Shift+Tab reverses.
  const cycleCommand = (dir) => {
    if (acStemRef.current == null) { acStemRef.current = command; acIdxRef.current = -1 }
    const cands = rankCandidates(acStemRef.current.trim().toLowerCase())
    if (!cands.length) return
    acIdxRef.current = (acIdxRef.current + dir + cands.length) % cands.length
    setCommand(cands[acIdxRef.current])
  }

  // Toggle the box between string-filter and resource-filter modes (re-focuses).
  const toggleBoxMode = () => {
    const next = resMode ? 'str' : 'res'
    setFilterMode(next)
    setFilterActive(true)
    if (next === 'res') { setCommand(''); acStemRef.current = null; acIdxRef.current = -1 }
  }

  // Pick a resource candidate (Enter on the input, or click in the dropdown).
  const pickResource = (name) => {
    if (submitCommand(name)) filterRef.current?.blur()
  }

  const showBreadcrumb = navStack.length > 0 || !!drilldownLabel
  // A history frame's label = its drilldown leaf (last "›" segment) or its plain resource name.
  const crumbLabel = (f) => f.drilldownLabel ? f.drilldownLabel.split('›').pop().trim() : f.resource

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
        {/* Wordmark */}
        <span className="mezz-wordmark" style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, paddingRight: 2 }}>
          mezza9
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
                  if (resMode) pickResource(resCandidates[0] && !RESOURCE_ALIASES[command.trim().toLowerCase()] ? resCandidates[0] : command)
                  else filterRef.current?.blur()
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
              {resCandidates.map(name => {
                const isCurrent = name === command.trim().toLowerCase()
                return (
                  <div key={name}
                    onMouseDown={e => { e.preventDefault(); pickResource(name) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 12px', cursor: 'pointer', fontSize: 11,
                      color: isCurrent ? 'var(--mz-alt)' : 'var(--mz-text-mid)',
                      background: isCurrent ? 'rgba(var(--mz-alt-rgb),0.15)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                    onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{name === 'ns' ? 'namespace (picker)' : name}</span>
                    {activeResource === name && <span style={{ fontSize: 9, color: 'var(--mz-alt)' }}>● current</span>}
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
      </div>

      {/* ── Detail panel ─────────────────────────────────────────── */}
      {selectedId && <DetailPanel width={panelWidth} />}

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
              {/* Past frames (oldest → newest), each jumps back to that depth */}
              {navStack.map((f, i) => (
                <span key={`b${i}`} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <span
                    onClick={() => navGo(-(navStack.length - i))}
                    title="back"
                    style={{ color: 'var(--mz-accent-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {crumbLabel(f)}
                  </span>
                  <span style={{ color: 'var(--mz-text-faint)', padding: '0 4px' }}>›</span>
                </span>
              ))}
              {/* Current view (not clickable) */}
              <span style={{ color: 'var(--mz-text)', whiteSpace: 'nowrap', fontWeight: 500, flexShrink: 0 }}>
                {drilldownLabel || activeResource}
              </span>
              {/* Future frames (forward history), each jumps forward to that depth */}
              {navFuture.map((f, j) => (
                <span key={`f${j}`} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'var(--mz-text-faint)', padding: '0 4px' }}>›</span>
                  <span
                    onClick={() => navGo(j + 1)}
                    title="forward"
                    style={{ color: 'var(--mz-accent-2)', cursor: 'pointer', whiteSpace: 'nowrap', opacity: 0.7 }}
                  >
                    {crumbLabel(f)}
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
