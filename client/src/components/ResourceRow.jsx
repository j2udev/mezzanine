import { useEffect, useRef } from 'react'
import { statusColor } from '../constants'

function rowFields(item, resource) {
  if (resource.startsWith('cr:')) {
    return [
      { value: item.status || '', color: statusColor(item.status), w: 88 },
      { value: item.age || '',    color: '#3a6070', w: 55, right: true },
    ]
  }
  switch (resource) {
    case 'pods':
      return [
        { value: item.status,                color: statusColor(item.status), w: 80 },
        { value: item.ready,                 color: '#4a8aaa', w: 44 },
        { value: `${item.restarts}`,         color: item.restarts > 0 ? '#ffcc00' : '#3a6070', w: 70 },
        { value: item.ip || '',              color: '#3a7090', w: 110, mono: true },
        { value: (item.node || '').replace(/^kind-/, ''), color: '#3a6070', w: 120, mono: true },
        { value: item.age || '',             color: '#3a6070', w: 55, right: true },
      ]
    case 'deployments':
      return [
        { value: item.status,            color: statusColor(item.status), w: 80 },
        { value: item.ready,             color: '#4a8aaa', w: 50 },
        { value: `${item.upToDate ?? item.readyReplicas ?? 0}`, color: '#3a6070', w: 72 },
        { value: `${item.available ?? 0}`,  color: '#3a6070', w: 55 },
        { value: item.age || '',         color: '#3a6070', w: 55, right: true },
      ]
    case 'services':
      return [
        { value: item.type,              color: '#aa55ff', w: 88 },
        { value: item.clusterIP,         color: '#3a7090', w: 100, mono: true },
        { value: item.externalIP || '',  color: item.externalIP ? '#00d4ff' : '#253a55', w: 130, mono: true },
        { value: item.ports,             color: '#3a6070', w: 130, mono: true },
        { value: item.age || '',         color: '#3a6070', w: 55, right: true },
      ]
    case 'statefulsets':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.ready,     color: '#4a8aaa', w: 60 },
        { value: item.age || '', color: '#3a6070', w: 55, right: true },
      ]
    case 'daemonsets':
      return [
        { value: item.status,         color: statusColor(item.status), w: 88 },
        { value: `${item.desired}`,   color: '#3a7090', w: 72 },
        { value: `${item.ready}`,     color: item.ready < item.desired ? '#ffcc00' : '#4a8aaa', w: 60 },
        { value: item.age || '',      color: '#3a6070', w: 55, right: true },
      ]
    case 'jobs':
      return [
        { value: item.status,      color: statusColor(item.status), w: 88 },
        { value: item.completions, color: '#4a8aaa', w: 100 },
        { value: item.duration,    color: '#3a6070', w: 72 },
        { value: item.age || '',   color: '#3a6070', w: 55, right: true },
      ]
    case 'cronjobs':
      return [
        { value: item.status,       color: statusColor(item.status), w: 88 },
        { value: item.schedule,     color: '#aa55ff', w: 140, mono: true },
        { value: `${item.active}`,  color: item.active > 0 ? '#ffcc00' : '#2a4a6a', w: 60 },
        { value: item.lastSchedule, color: '#3a6070', w: 72 },
        { value: item.age || '',    color: '#3a6070', w: 55, right: true },
      ]
    case 'ingresses':
      return [
        { value: item.hosts,     color: '#00d4ff', w: 180 },
        { value: item.address,   color: '#3a7090', w: 120, mono: true },
        { value: item.ports,     color: '#3a6070', w: 60 },
        { value: item.age || '', color: '#3a6070', w: 55, right: true },
      ]
    case 'configmaps':
      return [
        { value: `${item.keys} keys`, color: '#3a7090', w: 60 },
        { value: item.age,            color: '#3a6070', w: 72, right: true },
      ]
    case 'secrets':
      return [
        { value: item.type,           color: '#ff4488', w: 180 },
        { value: `${item.keys} keys`, color: '#3a7090', w: 60 },
        { value: item.age || '',      color: '#3a6070', w: 55, right: true },
      ]
    case 'pvcs':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.volume,    color: '#3a7090', w: 150, mono: true },
        { value: item.capacity,  color: '#3a6070', w: 90 },
        { value: item.age || '', color: '#3a6070', w: 55, right: true },
      ]
    case 'pvs':
      return [
        { value: item.status,       color: statusColor(item.status), w: 88 },
        { value: item.claim,        color: '#3a7090', w: 200, mono: true },
        { value: item.storageClass, color: '#aa55ff', w: 110 },
        { value: item.capacity,     color: '#3a6070', w: 90 },
        { value: item.age || '',    color: '#3a6070', w: 55, right: true },
      ]
    case 'nodes':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.roles,     color: '#aa55ff', w: 120 },
        { value: item.version,   color: '#3a6070', w: 100, mono: true },
        { value: item.age || '', color: '#3a6070', w: 55, right: true },
      ]
    case 'namespaces':
      return [
        { value: item.status,    color: statusColor(item.status), w: 88 },
        { value: item.age || '', color: '#3a6070', w: 55, right: true },
      ]
    case 'crds':
      return [
        { value: item.group,                                 color: '#aa55ff', w: 180, mono: true },
        { value: item.version,                               color: '#4a8aaa', w: 80 },
        { value: item.namespaced ? 'Namespaced' : 'Cluster', color: '#3a6070', w: 80 },
        { value: item.age || '',                             color: '#3a6070', w: 55, right: true },
      ]
    case 'helmreleases':
      return [
        { value: item.chart,         color: '#00d4ff', w: 200 },
        { value: `v${item.version}`, color: '#3a7090', w: 80, mono: true },
        { value: item.status,        color: statusColor(item.status), w: 88 },
        { value: item.age || '',     color: '#3a6070', w: 55, right: true },
      ]
    case 'replicasets':
      return [
        { value: item.status, color: statusColor(item.status), w: 88 },
        { value: item.ready,  color: '#4a8aaa', w: 60 },
        { value: item.age,    color: '#3a6070', w: 55, right: true },
      ]
    case 'hpa':
      return [
        { value: item.targetRef,                         color: '#aa55ff', w: 200 },
        { value: `${item.minReplicas}–${item.maxReplicas}`, color: '#3a7090', w: 80 },
        { value: `${item.currentReplicas}`,              color: '#4a8aaa', w: 60 },
        { value: item.age || '',                         color: '#3a6070', w: 55, right: true },
      ]
    case 'pdb':
      return [
        { value: item.status,                                    color: statusColor(item.status), w: 88 },
        { value: item.minAvailable ? `min:${item.minAvailable}` : `maxUnavail:${item.maxUnavailable}`, color: '#aa55ff', w: 140 },
        { value: `${item.allowed} allowed`,                     color: '#3a6070', w: 90 },
        { value: item.age || '',                                color: '#3a6070', w: 55, right: true },
      ]
    case 'networkpolicies':
      return [
        { value: `in:${item.ingress}`,  color: '#00d4ff', w: 70 },
        { value: `out:${item.egress}`,  color: '#ff4488', w: 70 },
        { value: item.age,              color: '#3a6070', w: 55, right: true },
      ]
    case 'serviceaccounts':
      return [
        { value: `${item.secrets} secrets`, color: '#3a7090', w: 100 },
        { value: item.age,                  color: '#3a6070', w: 55, right: true },
      ]
    case 'resourcequotas':
      return [
        { value: `cpu: ${item.cpu}`,    color: '#44aaff', w: 150, mono: true },
        { value: `mem: ${item.memory}`, color: '#aa55ff', w: 160, mono: true },
        { value: `pods: ${item.pods}`,  color: '#3a6070', w: 90, mono: true },
        { value: item.age || '',        color: '#3a6070', w: 55, right: true },
      ]
    case 'storageclasses':
      return [
        { value: item.provisioner,  color: '#44aaff', w: 220, mono: true },
        { value: item.reclaim,      color: '#aa55ff', w: 80 },
        { value: item.bindingMode,  color: '#3a6070', w: 180 },
        { value: item.age || '',    color: '#3a6070', w: 55, right: true },
      ]
    case 'roles':
    case 'clusterroles':
      return [
        { value: `${item.rules} rule${item.rules !== 1 ? 's' : ''}`, color: '#ff8844', w: 80 },
        { value: item.age, color: '#3a6070', w: 55, right: true },
      ]
    case 'rolebindings':
    case 'clusterrolebindings':
      return [
        { value: item.roleRef,                                   color: '#ff8844', w: 220 },
        { value: `${item.subjects} subject${item.subjects !== 1 ? 's' : ''}`, color: '#3a7090', w: 90 },
        { value: item.age,                                       color: '#3a6070', w: 55, right: true },
      ]
    case 'events':
      return [
        { value: item.type,   color: statusColor(item.type), w: 72 },
        { value: item.reason, color: '#aa55ff', w: 140 },
        { value: item.object, color: '#3a7090', w: 200, mono: true },
        { value: `×${item.count}`, color: item.count > 1 ? '#ffcc44' : '#3a6070', w: 50 },
        { value: item.age || '',   color: '#3a6070', w: 55, right: true },
      ]
    case 'containers':
      return [
        { value: item.status, color: statusColor(item.status), w: 88 },
        { value: item.pod,    color: '#3a7090', w: 200, mono: true },
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
        borderLeft: `3px solid ${multiSelected ? '#ffcc44' : selected ? rowColor : 'transparent'}`,
        background: multiSelected
          ? 'rgba(255,204,68,0.08)'
          : selected
            ? `linear-gradient(90deg, ${rowColor}18 0%, transparent 60%)`
            : 'transparent',
        boxShadow: selected ? `inset 0 0 24px ${rowColor}0a` : 'none',
        transition: 'background 0.15s, border-color 0.15s',
        animation: 'rowIn 0.18s ease both',
        animationDelay: `${animDelay}ms`,
      }}
      onMouseEnter={e => { if (!selected && !multiSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected && !multiSelected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Selection caret / multi-select indicator */}
      <span style={{ width: 14, fontSize: 9, flexShrink: 0, color: multiSelected ? '#ffcc44' : selected ? rowColor : 'transparent', textShadow: (selected || multiSelected) ? `0 0 8px ${multiSelected ? '#ffcc44' : rowColor}` : 'none' }}>
        {multiSelected ? '◆' : '▶'}
      </span>

      {/* Status dot */}
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: rowColor, boxShadow: `0 0 6px ${rowColor}`, flexShrink: 0, marginRight: 10 }} />

      {/* Namespace (flat list mode) */}
      {nsColumnWidth > 0 && (
        <span style={{
          width: nsColumnWidth, flexShrink: 0, fontSize: 11, paddingRight: 8,
          color: nsColor || '#3a6070', fontFamily: 'inherit',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.namespace || ''}
        </span>
      )}

      {/* Name */}
      <span style={{ flex: 1, fontSize: 12, color: selected ? '#e8f4ff' : '#9ab8d0', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.01em', minWidth: 80 }}>
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
