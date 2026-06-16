import { useEffect, useRef } from 'react'
import { alpha } from '../theme'
import { statusColor } from '../constants'

function rowFields(item, resource) {
  if (resource.startsWith('cr:')) {
    return [
      { value: item.status || '', color: statusColor(item.status), w: 88 },
      { value: item.age || '',    color: 'var(--mz-text-dim)', w: 55, right: true },
    ]
  }
  switch (resource) {
    case 'pods':
      return [
        { value: item.status,                color: statusColor(item.status), w: 80 },
        { value: item.ready,                 color: 'var(--mz-accent-2)', w: 44 },
        { value: `${item.restarts}`,         color: item.restarts > 0 ? 'var(--mz-warn)' : 'var(--mz-text-dim)', w: 70 },
        { value: item.ip || '',              color: 'var(--mz-accent-2)', w: 110, mono: true },
        { value: (item.node || '').replace(/^kind-/, ''), color: 'var(--mz-text-dim)', w: 120, mono: true },
        { value: item.age || '',             color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'deployments':
      return [
        { value: item.status,            color: statusColor(item.status), w: 80 },
        { value: item.ready,             color: 'var(--mz-accent-2)', w: 50 },
        { value: `${item.upToDate ?? item.readyReplicas ?? 0}`, color: 'var(--mz-text-dim)', w: 72 },
        { value: `${item.available ?? 0}`,  color: 'var(--mz-text-dim)', w: 55 },
        { value: item.age || '',         color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'services':
      return [
        { value: item.type,              color: 'var(--mz-alt)', w: 88 },
        { value: item.clusterIP,         color: 'var(--mz-accent-2)', w: 100, mono: true },
        { value: item.externalIP || '',  color: item.externalIP ? 'var(--mz-accent)' : 'var(--mz-text-faint)', w: 130, mono: true },
        { value: item.ports,             color: 'var(--mz-text-dim)', w: 130, mono: true },
        { value: item.age || '',         color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'statefulsets':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.ready,     color: 'var(--mz-accent-2)', w: 60 },
        { value: item.age || '', color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'daemonsets':
      return [
        { value: item.status,         color: statusColor(item.status), w: 88 },
        { value: `${item.desired}`,   color: 'var(--mz-accent-2)', w: 72 },
        { value: `${item.ready}`,     color: item.ready < item.desired ? 'var(--mz-warn)' : 'var(--mz-accent-2)', w: 60 },
        { value: item.age || '',      color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'jobs':
      return [
        { value: item.status,      color: statusColor(item.status), w: 88 },
        { value: item.completions, color: 'var(--mz-accent-2)', w: 100 },
        { value: item.duration,    color: 'var(--mz-text-dim)', w: 72 },
        { value: item.age || '',   color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'cronjobs':
      return [
        { value: item.status,       color: statusColor(item.status), w: 88 },
        { value: item.schedule,     color: 'var(--mz-alt)', w: 140, mono: true },
        { value: `${item.active}`,  color: item.active > 0 ? 'var(--mz-warn)' : 'var(--mz-text-faint)', w: 60 },
        { value: item.lastSchedule, color: 'var(--mz-text-dim)', w: 72 },
        { value: item.age || '',    color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'ingresses':
      return [
        { value: item.hosts,     color: 'var(--mz-accent)', w: 180 },
        { value: item.address,   color: 'var(--mz-accent-2)', w: 120, mono: true },
        { value: item.ports,     color: 'var(--mz-text-dim)', w: 60 },
        { value: item.age || '', color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'configmaps':
      return [
        { value: `${item.keys} keys`, color: 'var(--mz-accent-2)', w: 60 },
        { value: item.age,            color: 'var(--mz-text-dim)', w: 72, right: true },
      ]
    case 'secrets':
      return [
        { value: item.type,           color: 'var(--mz-pink)', w: 180 },
        { value: `${item.keys} keys`, color: 'var(--mz-accent-2)', w: 60 },
        { value: item.age || '',      color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'pvcs':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.volume,    color: 'var(--mz-accent-2)', w: 150, mono: true },
        { value: item.capacity,  color: 'var(--mz-text-dim)', w: 90 },
        { value: item.age || '', color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'pvs':
      return [
        { value: item.status,       color: statusColor(item.status), w: 88 },
        { value: item.claim,        color: 'var(--mz-accent-2)', w: 200, mono: true },
        { value: item.storageClass, color: 'var(--mz-alt)', w: 110 },
        { value: item.capacity,     color: 'var(--mz-text-dim)', w: 90 },
        { value: item.age || '',    color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'nodes':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.roles,     color: 'var(--mz-alt)', w: 120 },
        { value: item.version,   color: 'var(--mz-text-dim)', w: 100, mono: true },
        { value: item.age || '', color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'namespaces':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.age || '', color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'crds':
      return [
        { value: item.group,                                 color: 'var(--mz-alt)', w: 180, mono: true },
        { value: item.version,                               color: 'var(--mz-accent-2)', w: 80 },
        { value: item.namespaced ? 'Namespaced' : 'Cluster', color: 'var(--mz-text-dim)', w: 80 },
        { value: item.age || '',                             color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'helmreleases':
      return [
        { value: item.chart,         color: 'var(--mz-accent)', w: 200 },
        { value: `v${item.version}`, color: 'var(--mz-accent-2)', w: 80, mono: true },
        { value: item.status,        color: statusColor(item.status), w: 88 },
        { value: item.age || '',     color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'replicasets':
      return [
        { value: item.status, color: statusColor(item.status), w: 88 },
        { value: item.ready,  color: 'var(--mz-accent-2)', w: 60 },
        { value: item.age,    color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'hpa':
      return [
        { value: item.targetRef,                         color: 'var(--mz-alt)', w: 200 },
        { value: `${item.minReplicas}–${item.maxReplicas}`, color: 'var(--mz-accent-2)', w: 80 },
        { value: `${item.currentReplicas}`,              color: 'var(--mz-accent-2)', w: 60 },
        { value: item.age || '',                         color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'pdb':
      return [
        { value: item.status,                                    color: statusColor(item.status), w: 88 },
        { value: item.minAvailable ? `min:${item.minAvailable}` : `maxUnavail:${item.maxUnavailable}`, color: 'var(--mz-alt)', w: 140 },
        { value: `${item.allowed} allowed`,                     color: 'var(--mz-text-dim)', w: 90 },
        { value: item.age || '',                                color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'networkpolicies':
      return [
        { value: `in:${item.ingress}`,  color: 'var(--mz-accent)', w: 70 },
        { value: `out:${item.egress}`,  color: 'var(--mz-pink)', w: 70 },
        { value: item.age,              color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'serviceaccounts':
      return [
        { value: `${item.secrets} secrets`, color: 'var(--mz-accent-2)', w: 100 },
        { value: item.age,                  color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'resourcequotas':
      return [
        { value: `cpu: ${item.cpu}`,    color: 'var(--mz-info)', w: 150, mono: true },
        { value: `mem: ${item.memory}`, color: 'var(--mz-alt)', w: 160, mono: true },
        { value: `pods: ${item.pods}`,  color: 'var(--mz-text-dim)', w: 90, mono: true },
        { value: item.age || '',        color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'storageclasses':
      return [
        { value: item.provisioner,  color: 'var(--mz-info)', w: 220, mono: true },
        { value: item.reclaim,      color: 'var(--mz-alt)', w: 80 },
        { value: item.bindingMode,  color: 'var(--mz-text-dim)', w: 180 },
        { value: item.age || '',    color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'roles':
    case 'clusterroles':
      return [
        { value: `${item.rules} rule${item.rules !== 1 ? 's' : ''}`, color: 'var(--mz-orange)', w: 80 },
        { value: item.age, color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'rolebindings':
    case 'clusterrolebindings':
      return [
        { value: item.roleRef,                                   color: 'var(--mz-orange)', w: 220 },
        { value: `${item.subjects} subject${item.subjects !== 1 ? 's' : ''}`, color: 'var(--mz-accent-2)', w: 90 },
        { value: item.age,                                       color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'events':
      return [
        { value: item.type,   color: statusColor(item.type), w: 72 },
        { value: item.reason, color: 'var(--mz-alt)', w: 140 },
        { value: item.object, color: 'var(--mz-accent-2)', w: 200, mono: true },
        { value: `×${item.count}`, color: item.count > 1 ? 'var(--mz-warn-2)' : 'var(--mz-text-dim)', w: 50 },
        { value: item.age || '',   color: 'var(--mz-text-dim)', w: 55, right: true },
      ]
    case 'containers':
      return [
        { value: item.status, color: statusColor(item.status), w: 88 },
        { value: item.pod,    color: 'var(--mz-accent-2)', w: 200, mono: true },
      ]
    case 'portforwards':
      return [
        { value: item.resource.replace(/s$/, ''),  color: 'var(--mz-alt)', w: 100 },
        { value: `127.0.0.1:${item.localPort}`,     color: 'var(--mz-accent)', w: 130, mono: true },
        { value: `→ ${item.remotePort}`,            color: 'var(--mz-accent-2)', w: 70, mono: true },
        { value: item.status,                       color: statusColor(item.status), w: 80 },
        { value: item.error || '',                  color: 'var(--mz-danger-2)', w: 160 },
      ]
    default:
      return item.status ? [
        { value: item.status, color: statusColor(item.status), w: 88 },
      ] : []
  }
}

export function ResourceRow({ item, resource, selected, multiSelected, scrollIntoView, onSelect, onToggleMulti, animDelay, firstInGroup, nsColumnWidth = 0, nsColor }) {
  const ref = useRef()
  const rowColor = statusColor(item.status)
  const fields = rowFields(item, resource)

  useEffect(() => {
    if (selected && scrollIntoView && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected, scrollIntoView])

  return (
    <div
      ref={ref}
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', height: 36,
        paddingLeft: 4, paddingRight: 16, gap: 0, cursor: 'pointer',
        scrollMarginTop: firstInGroup ? 62 : 26,
        borderLeft: `3px solid ${multiSelected ? 'var(--mz-warn-2)' : selected ? rowColor : 'transparent'}`,
        background: multiSelected
          ? 'rgba(var(--mz-warn-2-rgb),0.08)'
          : selected
            ? `linear-gradient(90deg, ${alpha(rowColor, 9)} 0%, transparent 60%)`
            : 'transparent',
        boxShadow: selected ? `inset 0 0 24px ${alpha(rowColor, 4)}` : 'none',
        transition: 'background 0.15s, border-color 0.15s',
        animation: 'rowIn 0.18s ease both',
        animationDelay: `${animDelay}ms`,
      }}
      onMouseEnter={e => { if (!selected && !multiSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected && !multiSelected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Selection caret / multi-select indicator */}
      <span style={{ width: 14, fontSize: 9, flexShrink: 0, color: multiSelected ? 'var(--mz-warn-2)' : selected ? rowColor : 'transparent', textShadow: (selected || multiSelected) ? `0 0 8px ${multiSelected ? 'var(--mz-warn-2)' : rowColor}` : 'none' }}>
        {multiSelected ? '◆' : '▶'}
      </span>

      {/* Status dot */}
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: rowColor, boxShadow: `0 0 6px ${rowColor}`, flexShrink: 0, marginRight: 10 }} />

      {/* Namespace (flat list mode) */}
      {nsColumnWidth > 0 && (
        <span style={{
          width: nsColumnWidth, flexShrink: 0, fontSize: 11, paddingRight: 8,
          color: nsColor || 'var(--mz-text-dim)', fontFamily: 'inherit',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.namespace || ''}
        </span>
      )}

      {/* Name */}
      <span style={{ flex: 1, fontSize: 12, color: selected ? 'var(--mz-text-bright)' : 'var(--mz-text-mid)', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em', minWidth: 80 }}>
        {item.name}
      </span>

      {/* Type-specific columns */}
      {fields.map((f, i) => (
        <span key={i} style={{
          width: f.w, flexShrink: 0, fontSize: 11,
          color: f.color,
          fontFamily: f.mono ? 'monospace' : 'inherit',
          textAlign: f.right ? 'right' : 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          paddingLeft: f.right ? 0 : 8,
        }}>
          {f.value}
        </span>
      ))}
    </div>
  )
}
