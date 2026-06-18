import { useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'

// One accent color per section - color now encodes the resource *category* instead of
// being seemingly-random per item (#69). The highlight/active color a row gets is its
// group's color, so clicking around the sidebar reads as a coherent scheme.
const CUSTOM_COLOR = 'var(--mz-alt)'
const GROUPS = [
  {
    label: 'WORKLOADS', color: 'var(--mz-accent)',
    items: [
      { key: 'pods',         label: 'Pods'         },
      { key: 'deployments',  label: 'Deployments'  },
      { key: 'replicasets',  label: 'ReplicaSets'  },
      { key: 'statefulsets', label: 'StatefulSets' },
      { key: 'daemonsets',   label: 'DaemonSets'   },
      { key: 'jobs',         label: 'Jobs'         },
      { key: 'cronjobs',     label: 'CronJobs'     },
      { key: 'hpa',          label: 'HPA'          },
      { key: 'pdb',          label: 'PDB'          },
    ],
  },
  {
    label: 'NETWORK', color: 'var(--mz-orange)',
    items: [
      { key: 'services',        label: 'Services'         },
      { key: 'ingresses',       label: 'Ingresses'        },
      { key: 'networkpolicies', label: 'Network Policies' },
      { key: 'portforwards',    label: 'Port Forwards'    },
    ],
  },
  {
    label: 'CONFIG', color: 'var(--mz-alt)',
    items: [
      { key: 'configmaps',     label: 'ConfigMaps'      },
      { key: 'secrets',        label: 'Secrets'         },
      { key: 'serviceaccounts',label: 'Svc Accounts'    },
      { key: 'resourcequotas', label: 'Resource Quotas' },
    ],
  },
  {
    label: 'STORAGE', color: 'var(--mz-ok)',
    items: [
      { key: 'pvcs',          label: 'PVCs'               },
      { key: 'pvs',           label: 'Persistent Volumes' },
      { key: 'storageclasses',label: 'Storage Classes'    },
    ],
  },
  {
    label: 'RBAC', color: 'var(--mz-orange)',
    items: [
      { key: 'roles',               label: 'Roles'                },
      { key: 'clusterroles',        label: 'Cluster Roles'        },
      { key: 'rolebindings',        label: 'Role Bindings'        },
      { key: 'clusterrolebindings', label: 'Cluster Role Bindings'},
    ],
  },
  {
    label: 'CLUSTER', color: 'var(--mz-info)',
    items: [
      { key: 'nodes',      label: 'Nodes'      },
      { key: 'namespaces', label: 'Namespaces' },
      { key: 'events',     label: 'Events'     },
    ],
  },
  {
    label: 'HELM', color: 'var(--mz-ok)',
    items: [
      { key: 'helmreleases', label: 'Releases' },
    ],
  },
]

function SidebarItem({ isActive, color, label, count, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', height: 28,
        paddingLeft: 16, paddingRight: 8, cursor: 'pointer',
        borderLeft: `2px solid ${isActive ? color : 'transparent'}`,
        background: isActive ? `${alpha(color, 7)}` : 'transparent',
        transition: 'background 0.12s', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ flex: 1, fontSize: 11, color: isActive ? color : 'var(--mz-accent-2)', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: isActive ? `${alpha(color, 60)}` : 'var(--mz-accent-2)', fontFamily: 'inherit', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
        {count ?? 0}
      </span>
    </div>
  )
}

function SectionLabel({ children, collapsed, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: '6px 8px 4px', fontSize: 9, letterSpacing: '0.14em',
        color: 'var(--mz-accent-2)', fontWeight: 'bold', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        background: 'rgba(var(--mz-accent-rgb),0.04)',
        borderTop: '1px solid rgba(var(--mz-accent-rgb),0.07)',
        borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.05)',
        marginTop: 2,
      }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--mz-accent-2)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--mz-accent-2)'}
    >
      <span>{children}</span>
      <span style={{ fontSize: 8, opacity: 0.6 }}>{collapsed ? '›' : '˅'}</span>
    </div>
  )
}

export function Sidebar() {
  const activeResource    = useStore(s => s.activeResource)
  const collapsed         = useStore(s => s.sidebarCollapsed)
  const toggleSidebar     = useStore(s => s.toggleSidebar)
  const setActiveResource = useStore(s => s.setActiveResource)
  const crds              = useStore(s => s.crds)
  const fetchCrdResources = useStore(s => s.fetchCrdResources)

  const [groupCollapsed, setGroupCollapsed] = useState({})
  const toggleGroup = label =>
    setGroupCollapsed(prev => ({ ...prev, [label]: !prev[label] }))

  const counts = {
    pods:                useStore(s => s.pods.length),
    deployments:         useStore(s => s.deployments.length),
    replicasets:         useStore(s => s.replicasets.length),
    statefulsets:        useStore(s => s.statefulsets.length),
    daemonsets:          useStore(s => s.daemonsets.length),
    jobs:                useStore(s => s.jobs.length),
    cronjobs:            useStore(s => s.cronjobs.length),
    hpa:                 useStore(s => s.hpa.length),
    pdb:                 useStore(s => s.pdb.length),
    services:            useStore(s => s.services.length),
    ingresses:           useStore(s => s.ingresses.length),
    networkpolicies:     useStore(s => s.networkpolicies.length),
    portforwards:        useStore(s => s.portforwards.length),
    configmaps:          useStore(s => s.configmaps.length),
    secrets:             useStore(s => s.secrets.length),
    serviceaccounts:     useStore(s => s.serviceaccounts.length),
    resourcequotas:      useStore(s => s.resourcequotas.length),
    pvcs:                useStore(s => s.pvcs.length),
    pvs:                 useStore(s => s.pvs.length),
    storageclasses:      useStore(s => s.storageclasses.length),
    roles:               useStore(s => s.roles.length),
    clusterroles:        useStore(s => s.clusterroles.length),
    rolebindings:        useStore(s => s.rolebindings.length),
    clusterrolebindings: useStore(s => s.clusterrolebindings.length),
    nodes:               useStore(s => s.nodes.length),
    namespaces:          useStore(s => s.namespaces.length),
    events:              useStore(s => s.events.length),
    helmreleases:        useStore(s => s.helmreleases.length),
  }

  return (
    <div style={{
      position: 'absolute', top: 44, bottom: 36, left: 0,
      width: collapsed ? 36 : 200,
      background: 'rgba(var(--mz-surface-rgb),0.97)',
      borderRight: '1px solid rgba(var(--mz-accent-rgb), 0.07)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.18s ease', overflow: 'hidden',
      zIndex: 5, flexShrink: 0,
    }}>
      {/* Collapse toggle - top */}
      <div
        onClick={toggleSidebar}
        style={{
          height: 30, display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-end',
          paddingRight: collapsed ? 0 : 10,
          cursor: 'pointer', borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.06)',
          color: 'var(--mz-text-dim)', fontSize: 14, lineHeight: 1,
          flexShrink: 0, transition: 'color 0.12s', userSelect: 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--mz-accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--mz-text-dim)'}
        title={collapsed ? 'Expand sidebar (ctrl+b)' : 'Collapse sidebar (ctrl+b)'}
      >
        {collapsed ? '›' : '‹'}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 4 }}>
          {GROUPS.map(group => {
            const isGroupCollapsed = !!groupCollapsed[group.label]
            return (
              <div key={group.label}>
                <SectionLabel collapsed={isGroupCollapsed} onToggle={() => toggleGroup(group.label)}>
                  {group.label}
                </SectionLabel>
                {!isGroupCollapsed && group.items.map(({ key, label }) => (
                  <SidebarItem
                    key={key}
                    isActive={activeResource === key}
                    color={group.color} label={label} count={counts[key]}
                    onClick={() => setActiveResource(key)}
                  />
                ))}
              </div>
            )
          })}

          {crds.length > 0 && (
            <div>
              <SectionLabel
                collapsed={!!groupCollapsed['CUSTOM']}
                onToggle={() => toggleGroup('CUSTOM')}
              >
                CUSTOM ({crds.length})
              </SectionLabel>
              {!groupCollapsed['CUSTOM'] && crds.map(crd => {
                const crKey = `cr:${crd.group}/${crd.version}/${crd.plural}`
                const isActive = activeResource === crKey
                return (
                  <div
                    key={crd.id}
                    onClick={() => fetchCrdResources(crd.group, crd.version, crd.plural)}
                    style={{
                      display: 'flex', alignItems: 'center', height: 28,
                      paddingLeft: 16, paddingRight: 8, cursor: 'pointer',
                      borderLeft: `2px solid ${isActive ? CUSTOM_COLOR : 'transparent'}`,
                      background: isActive ? `${alpha(CUSTOM_COLOR, 7)}` : 'transparent',
                      transition: 'background 0.12s', userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ flex: 1, fontSize: 11, color: isActive ? CUSTOM_COLOR : 'var(--mz-accent-2)', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {crd.kind}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--mz-accent-2)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {crd.group.split('.')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
