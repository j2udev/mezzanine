import { useStore } from '../store'
import { alpha } from '../theme'
import { applicableActions } from '../actions'

const SKIP = new Set(['id', 'owner', 'ownerRef', 'containerPorts'])

function Field({ label, value }) {
  const display = Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value ?? '-')
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--mz-text-dim)' }}>{label}</div>
      <div className="text-xs break-all" style={{ color: 'var(--mz-text)', fontFamily: 'inherit' }}>{display}</div>
    </div>
  )
}

export function DetailPanel({ width = 288 }) {
  const selectedId     = useStore(s => s.selectedId)
  const activeResource = useStore(s => s.activeResource)
  const setSelected    = useStore(s => s.setSelected)
  const openActionMenu = useStore(s => s.openActionMenu)
  const items = useStore(s =>
    s.drilldownItems
      || (s.activeResource.startsWith('cr:') ? (s.crdResources[s.activeResource.slice(3)] || []) : (s[s.activeResource] || []))
  )

  const item = items.find(i => i.id === selectedId)
  if (!item) return null

  // Non-destructive actions render as wrapping chips (so they never overflow, however
  // many there are); destructive ones live only in the actions palette (a).
  const visibleActions = applicableActions(activeResource, { includeDanger: false })

  return (
    <div
      style={{
        position: 'absolute', right: 0, top: 44, bottom: 36,
        width, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'rgba(2, 10, 28, 0.98)',
        borderLeft: '1px solid rgba(var(--mz-accent-rgb), 0.12)',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.12)' }}>
        <div className="min-w-0">
          <div className="text-xs mb-0.5" style={{ color: 'var(--mz-accent-2)' }}>{activeResource.slice(0, -1)}</div>
          <div className="text-sm font-bold truncate" style={{ color: 'var(--mz-accent)', fontFamily: 'inherit' }}>
            {item.name}
          </div>
        </div>
        <button onClick={() => setSelected(null)}
          className="text-lg leading-none flex-shrink-0 mt-0.5 transition-colors"
          style={{ color: 'var(--mz-text-dim)' }}
          onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
          onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}>
          ×
        </button>
      </div>

      {/* Action chips - wrap instead of overflowing; scales to any number of actions */}
      {(visibleActions.length > 0) && (
        <div className="px-2 py-2 flex flex-wrap gap-1 items-center flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.08)' }}>
          {visibleActions.map(({ id, label, hint, color, run }) => (
            <button key={id} onClick={() => run(useStore.getState())}
              className="rounded transition-all"
              style={{
                color, fontSize: 10,
                background: `${alpha(color, 7)}`,
                border: `1px solid ${alpha(color, 19)}`,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                padding: '4px 8px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${alpha(color, 13)}`}
              onMouseLeave={e => e.currentTarget.style.background = `${alpha(color, 7)}`}
            >
              <span style={{ color: `${alpha(color, 53)}`, fontSize: 9 }}>{hint} </span>{label}
            </button>
          ))}
          {/* Palette: every applicable action (incl. destructive) */}
          <button onClick={openActionMenu}
            title="All actions (a)"
            className="rounded transition-all ml-auto"
            style={{
              color: 'var(--mz-text-dim)', fontSize: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'inherit', whiteSpace: 'nowrap', padding: '4px 8px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <span style={{ color: 'var(--mz-text-mid)', fontSize: 9 }}>a </span>⋯
          </button>
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {Object.entries(item)
          .filter(([k]) => !SKIP.has(k))
          .map(([k, v]) => <Field key={k} label={k} value={v} />)}
      </div>
    </div>
  )
}
