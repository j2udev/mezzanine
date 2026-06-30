import { useEffect, useRef, useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'
import { AWS_RESOURCES } from '../aws/resources'

// AWS "related resources" view (phase 1) - the keyboard-driven analog of the console's clickable
// cross-resource links on an instance / bucket detail page, and the multi-edge generalization of
// jumpToOwner. openRelated() fetches /api/aws/related and fills relatedModal.links; this renders
// them as a pick-list. j/k move, Enter teleports to the linked resource (store.jumpToRelated pushes
// a nav frame so `[`/Esc returns), / filters. A link whose target isn't in the current data stream
// (cross-account/region) is shown greyed - jumpToRelated returns false and we flag it inline.
const ACCENT = 'var(--mz-accent-2)'

const kindLabel = (resource) => AWS_RESOURCES[resource]?.label || resource

export function RelatedModal() {
  const relatedModal  = useStore(s => s.relatedModal)
  const closeRelated  = useStore(s => s.closeRelated)
  const jumpToRelated = useStore(s => s.jumpToRelated)
  // Subscribe to the broadcast slices so the "in this view?" check re-resolves as data arrives.
  const ec2instances  = useStore(s => s.ec2instances)
  const securitygroups = useStore(s => s.securitygroups)
  const ebsvolumes    = useStore(s => s.ebsvolumes)
  const vpcs          = useStore(s => s.vpcs)
  const elasticips    = useStore(s => s.elasticips)
  const s3buckets     = useStore(s => s.s3buckets)
  const lambdafunctions = useStore(s => s.lambdafunctions)
  const byResource = { ec2instances, securitygroups, ebsvolumes, vpcs, elasticips, s3buckets, lambdafunctions }

  const [idx, setIdx] = useState(0)
  const [filter, setFilter] = useState('')
  const [filtering, setFiltering] = useState(false)
  const [missMsg, setMissMsg] = useState('')
  const filterRef = useRef(null)

  useEffect(() => { setIdx(0); setFilter(''); setFiltering(false); setMissMsg('') }, [relatedModal?.label])
  useEffect(() => { if (filtering) filterRef.current?.focus() }, [filtering])

  // Resolve once per render: each link + whether its target exists in current data (jumpable).
  const links = relatedModal?.links || []
  const resolved = links.map(l => {
    const present = (byResource[l.resource] || []).some(i => i.id === l.id || i.name === l.id)
    return { ...l, present }
  })
  const q = filter.trim().toLowerCase()
  const rows = q
    ? resolved.filter(l => `${l.relation} ${kindLabel(l.resource)} ${l.name} ${l.id}`.toLowerCase().includes(q))
    : resolved

  // Capture-phase key handler (like the other modals) so it wins over the list's useKeys.
  useEffect(() => {
    if (!relatedModal) return
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT'
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        if (filtering) { setFiltering(false); setFilter('') }
        else closeRelated()
        return
      }
      if (inInput) return   // the filter input owns its own typing
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setIdx(i => Math.min(i + 1, Math.max(rows.length - 1, 0)))
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setIdx(i => Math.max(i - 1, 0))
      } else if (e.key === '/') {
        e.preventDefault(); e.stopPropagation()
        setFiltering(true)
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        const link = rows[idx]
        if (link) {
          if (!jumpToRelated(link)) setMissMsg(`${kindLabel(link.resource)} ${link.name} is not loaded in this view.`)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [relatedModal, rows, idx, filtering, closeRelated, jumpToRelated])

  if (!relatedModal) return null
  const { label, loading, error } = relatedModal

  return (
    <div
      onClick={closeRelated}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(620px, 94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: `1px solid ${alpha(ACCENT, 28)}`, boxShadow: `0 0 50px ${alpha(ACCENT, 13)}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>RELATED</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
          <button onClick={closeRelated}
            style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
          >×</button>
        </div>

        {/* Filter (shown when active) */}
        {filtering && (
          <div style={{ padding: '8px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}` }}>
            <input
              ref={filterRef}
              value={filter}
              onChange={e => { setFilter(e.target.value); setIdx(0) }}
              placeholder="filter related resources…"
              spellCheck={false}
              style={{
                fontFamily: 'monospace', fontSize: 12, padding: '5px 8px', borderRadius: 4, width: '100%',
                color: 'var(--mz-text)', background: 'var(--mz-bg)', border: `1px solid ${alpha(ACCENT, 30)}`, outline: 'none',
              }}
            />
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '8px 8px', overflow: 'auto', flex: 1 }}>
          {loading && <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic', padding: '8px 10px' }}>Resolving connected resources…</div>}
          {error && <div style={{ fontSize: 11, color: 'var(--mz-danger-2)', padding: '8px 10px' }}>Error: {error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic', padding: '8px 10px' }}>
              {q ? 'No related resources match the filter.' : 'No connected resources found.'}
            </div>
          )}
          {rows.map((l, i) => {
            const sel = i === idx
            return (
              <div
                key={`${l.resource}:${l.id}:${i}`}
                onClick={() => setIdx(i)}
                onDoubleClick={() => { if (!jumpToRelated(l)) setMissMsg(`${kindLabel(l.resource)} ${l.name} is not loaded in this view.`) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                  background: sel ? alpha(ACCENT, 12) : 'transparent',
                  border: `1px solid ${sel ? alpha(ACCENT, 30) : 'transparent'}`,
                  opacity: l.present ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--mz-text-faint)', width: 120, flexShrink: 0, textTransform: 'uppercase' }}>
                  {l.relation}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--mz-alt)', width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {kindLabel(l.resource)}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: l.present ? 'var(--mz-accent)' : 'var(--mz-text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.name}
                </span>
                {!l.present && <span style={{ fontSize: 9, color: 'var(--mz-text-faint)', flexShrink: 0 }}>not in view</span>}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderTop: `1px solid ${alpha(ACCENT, 9)}`, gap: 12,
        }}>
          <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>j/k · move    ↵ · jump    / · filter    esc · close</span>
          {missMsg && <span style={{ fontSize: 10, color: 'var(--mz-warn)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{missMsg}</span>}
        </div>
      </div>
    </div>
  )
}
