import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'

const SECTIONS = [
  {
    title: 'NAVIGATION',
    color: 'var(--mz-accent)',
    keys: [
      ['j / k', 'Select prev / next row'],
      ['gg / G', 'First / last row'],
      ['Enter', 'Drill in (CRD: list its resources)'],
      ['[ / ]', 'History back / forward'],
      ['ctrl+y', 'Show / hide history trail'],
      ['ctrl+shift+y', 'Clear history trail'],
      ['ctrl+b', 'Toggle sidebar'],
      ['ctrl+\\', 'Toggle detail drawer'],
      ['Esc', 'Clear selection / filter (not history)'],
    ],
  },
  {
    title: 'SORT & FILTER',
    color: 'var(--mz-warn-2)',
    keys: [
      ['Shift+N', 'Sort by name'],
      ['Shift+A', 'Sort by age'],
      ['Shift+S', 'Sort by status'],
      ['(repeat)', 'Toggle sort direction'],
      ['ctrl+z', 'Toggle faults-only'],
      ['ctrl+g', 'Toggle namespace grouping'],
      ['w', 'Warp to selected resource\'s namespace'],
      ['Shift+T', 'Theme switcher'],
      ['/', 'Filter by name / namespace'],
      [':', 'Resource picker (:pods, :ns, :whoami, CRDs …)'],
    ],
  },
  {
    title: 'ACTIONS',
    color: 'var(--mz-ok)',
    keys: [
      ['a', 'Actions palette'],
      ['Space', 'Mark / unmark row'],
      ['l', 'Logs'],
      ['d', 'Describe'],
      ['y', 'YAML / JSON'],
      ['e', 'Edit'],
      ['x', 'Decode secret'],
      ['p / Enter', 'RBAC policy / rules (roles, bindings, SAs)'],
      [':whoami', 'My access review (kubectl auth can-i)'],
      ['s', 'Shell into pod'],
      ['Shift+D', 'Debug (ephemeral container)'],
      ['Shift+F', 'Port-forward'],
      ['Shift+J', 'Jump to owner'],
      ['ctrl+d', 'Delete (confirm)'],
      ['ctrl+k', 'Kill (no confirm)'],
    ],
  },
  {
    title: 'HELM (release selected)',
    color: 'var(--mz-orange)',
    keys: [
      ['v', 'Values (Tab: user / all)'],
      ['m', 'Manifest'],
      ['n', 'Notes'],
      ['h', 'History (rollback / values)'],
      ['d', 'Describe'],
    ],
  },
  {
    title: 'MODAL (describe / yaml / logs / edit)',
    color: 'var(--mz-alt)',
    keys: [
      ['j / k', 'Scroll'],
      ['ctrl+d / u', 'Half-page scroll'],
      ['gg / G', 'Top / bottom'],
      ['Tab', 'Describe / YAML / JSON'],
      ['/', 'Search'],
      ['n / N', 'Next / prev match'],
      ['e', 'Edit mode (full vim)'],
      ['?', 'Vim keys (in edit mode)'],
      ['x', 'Decode secret (yaml / json)'],
      ['#', 'Toggle line numbers'],
      ['c', 'Copy'],
    ],
  },
]

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3, minWidth: 18,
      textAlign: 'center', fontSize: 10, color: 'var(--mz-text-mid)',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      fontFamily: 'inherit',
    }}>{children}</span>
  )
}

// Flattened (section-tagged) shortcut list, so the modal can filter/navigate across
// every section while still rendering them grouped.
const FLAT = SECTIONS.flatMap(s => s.keys.map(([k, label]) => ({ section: s.title, color: s.color, k, label })))

export function HelpModal() {
  const helpOpen    = useStore(s => s.helpOpen)
  const setHelpOpen = useStore(s => s.setHelpOpen)

  const [filter, setFilter]               = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const inputRef    = useRef()
  const scrollRef   = useRef()

  const matches = useMemo(() => {
    if (!filter) return FLAT
    const q = filter.toLowerCase()
    return FLAT.filter(e => e.k.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
  }, [filter])

  // Re-group the (possibly filtered) matches back into sections for display, preserving
  // section + within-section order so a running counter lines up with the nav index.
  const grouped = useMemo(() => {
    const map = new Map()
    matches.forEach(e => {
      if (!map.has(e.section)) map.set(e.section, { color: e.color, items: [] })
      map.get(e.section).items.push(e)
    })
    return [...map.entries()]
  }, [matches])

  // Open with the filter unfocused: j/k just scrolls the modal, `/` focuses the filter (#74).
  useEffect(() => { if (helpOpen) { setFilter(''); setSearchFocused(false) } }, [helpOpen])

  useEffect(() => {
    if (!helpOpen) return
    const onKey = e => {
      // While the filter input is focused, let it own typing; only Esc (back to nav) is grabbed.
      if (searchFocused) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inputRef.current?.blur() }
        return
      }
      const el = scrollRef.current
      if (e.key === 'Escape' || e.key === '?')    { e.preventDefault(); e.stopPropagation(); setHelpOpen(false); return }
      if (e.key === '/')                          { e.preventDefault(); e.stopPropagation(); inputRef.current?.focus(); return }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); el?.scrollBy({ top: 48 });  return }
      if (e.key === 'k' || e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); el?.scrollBy({ top: -48 }); return }
      if (e.key === 'd' && e.ctrlKey)             { e.preventDefault(); e.stopPropagation(); el?.scrollBy({ top: (el.clientHeight / 2) });  return }
      if (e.key === 'u' && e.ctrlKey)             { e.preventDefault(); e.stopPropagation(); el?.scrollBy({ top: -(el.clientHeight / 2) }); return }
      if (e.key === 'g')                          { e.preventDefault(); e.stopPropagation(); el?.scrollTo({ top: 0 }); return }
      if (e.key === 'G')                          { e.preventDefault(); e.stopPropagation(); el?.scrollTo({ top: el.scrollHeight }); return }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [helpOpen, setHelpOpen, searchFocused])

  if (!helpOpen) return null

  return (
    <div
      onClick={() => setHelpOpen(false)}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        ref={scrollRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(820px, 94vw)', maxHeight: '86vh', overflowY: 'auto',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: '1px solid rgba(var(--mz-accent-rgb),0.28)', boxShadow: '0 0 50px rgba(var(--mz-accent-rgb),0.12)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.18)',
          position: 'sticky', top: 0, background: 'rgba(var(--mz-surface-rgb),0.98)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.16em', color: 'var(--mz-accent)' }}>
              KEYBOARD SHORTCUTS
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>j/k · / filter · esc close</span>
              <button onClick={() => setHelpOpen(false)}
                style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
                onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
              >×</button>
            </div>
          </div>
          <input
            ref={inputRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={searchFocused ? 'filter shortcuts…' : 'press / to filter'}
            style={{
              width: '100%',
              background: searchFocused ? 'rgba(var(--mz-accent-rgb),0.1)' : 'rgba(var(--mz-accent-rgb),0.04)',
              border: `1px solid ${searchFocused ? 'rgba(var(--mz-accent-rgb),0.4)' : 'rgba(var(--mz-accent-rgb),0.12)'}`,
              color: 'var(--mz-text-bright)', fontSize: 12, padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Sections grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '8px 28px', padding: '16px 22px',
        }}>
          {grouped.length === 0 && (
            <div style={{ padding: '6px 0', fontSize: 11, color: 'var(--mz-text-dim)', fontStyle: 'italic' }}>
              No shortcuts match "{filter}".
            </div>
          )}
          {grouped.map(([title, { color, items }]) => (
            <div key={title}>
              <div style={{
                fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em',
                color, marginBottom: 8, marginTop: 6,
              }}>{title}</div>
              {items.map(({ k, label }) => (
                <div key={k + label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '3px 6px', margin: '0 -6px', fontSize: 11, borderRadius: 4,
                  }}>
                  <span style={{ flexShrink: 0, minWidth: 96 }}>
                    {k.split(' / ').map((part, i, arr) => (
                      <span key={part}>
                        <Kbd>{part}</Kbd>
                        {i < arr.length - 1 && <span style={{ color: 'var(--mz-text-dim)', margin: '0 2px' }}>/</span>}
                      </span>
                    ))}
                  </span>
                  <span style={{ color: 'var(--mz-text-dim)' }}>{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
