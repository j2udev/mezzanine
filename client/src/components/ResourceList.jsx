import { useMemo } from 'react'
import { useStore, arrangeForDisplay, isFault } from '../store'
import { getNsColor } from '../constants'
import { ResourceRow } from './ResourceRow'

// Column header label → sort key (only these columns are sortable)
const SORT_KEYS = { NAME: 'name', STATUS: 'status', AGE: 'age' }

const COL_HEADERS = {
  pods:                ['STATUS', 'READY', 'RESTARTS', 'IP', 'NODE', 'AGE'],
  deployments:         ['STATUS', 'READY', 'UP-TO-DATE', 'AVAIL', 'AGE'],
  replicasets:         ['STATUS', 'READY', 'AGE'],
  services:            ['TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORTS', 'AGE'],
  statefulsets:        ['STATUS', 'READY', 'AGE'],
  daemonsets:          ['STATUS', 'DESIRED', 'READY', 'AGE'],
  jobs:                ['STATUS', 'COMPLETIONS', 'DURATION', 'AGE'],
  cronjobs:            ['STATUS', 'SCHEDULE', 'ACTIVE', 'LAST', 'AGE'],
  hpa:                 ['TARGET', 'MIN–MAX', 'CURRENT', 'AGE'],
  pdb:                 ['STATUS', 'CONSTRAINT', 'ALLOWED', 'AGE'],
  ingresses:           ['HOSTS', 'ADDRESS', 'PORTS', 'AGE'],
  networkpolicies:     ['INGRESS', 'EGRESS', 'AGE'],
  configmaps:          ['KEYS', 'AGE'],
  secrets:             ['TYPE', 'KEYS', 'AGE'],
  serviceaccounts:     ['SECRETS', 'AGE'],
  resourcequotas:      ['CPU (used/hard)', 'MEMORY (used/hard)', 'PODS', 'AGE'],
  pvcs:                ['STATUS', 'VOLUME', 'CAPACITY', 'AGE'],
  pvs:                 ['STATUS', 'CLAIM', 'STORAGECLASS', 'CAPACITY', 'AGE'],
  storageclasses:      ['PROVISIONER', 'RECLAIM', 'BINDING MODE', 'AGE'],
  roles:               ['RULES', 'AGE'],
  clusterroles:        ['RULES', 'AGE'],
  rolebindings:        ['ROLEREF', 'SUBJECTS', 'AGE'],
  clusterrolebindings: ['ROLEREF', 'SUBJECTS', 'AGE'],
  nodes:               ['STATUS', 'ROLES', 'VERSION', 'AGE'],
  namespaces:          ['STATUS', 'AGE'],
  events:              ['TYPE', 'REASON', 'OBJECT', 'COUNT', 'AGE'],
  crds:                ['GROUP', 'VERSION', 'SCOPE', 'AGE'],
  helmreleases:        ['CHART', 'VERSION', 'STATUS', 'AGE'],
  containers:          ['STATUS', 'POD'],
  __cr__:              ['STATUS', 'AGE'],
}
const COL_WIDTHS = {
  pods:                [80, 44, 70, 110, 120, 55],
  deployments:         [80, 50, 72, 55, 55],
  replicasets:         [88, 60, 55],
  services:            [88, 100, 130, 130, 55],
  statefulsets:        [88, 60, 55],
  daemonsets:          [88, 72, 60, 55],
  jobs:                [88, 100, 72, 55],
  cronjobs:            [88, 140, 60, 72, 55],
  hpa:                 [200, 80, 60, 55],
  pdb:                 [88, 140, 90, 55],
  ingresses:           [180, 120, 60, 55],
  networkpolicies:     [70, 70, 55],
  configmaps:          [60, 72],
  secrets:             [180, 60, 55],
  serviceaccounts:     [100, 55],
  resourcequotas:      [150, 160, 90, 55],
  pvcs:                [88, 150, 90, 55],
  pvs:                 [88, 200, 110, 90, 55],
  storageclasses:      [220, 80, 180, 55],
  roles:               [80, 55],
  clusterroles:        [80, 55],
  rolebindings:        [220, 90, 55],
  clusterrolebindings: [220, 90, 55],
  nodes:               [88, 120, 100, 55],
  namespaces:          [88, 55],
  events:              [72, 140, 200, 50, 55],
  crds:                [180, 80, 80, 55],
  helmreleases:        [200, 80, 88, 55],
  containers:          [88, 200],
  __cr__:              [88, 55],
}

function SortArrow({ active, dir }) {
  if (!active) return null
  return <span style={{ color: '#00d4ff', marginLeft: 3 }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

// Width of the NAMESPACE column shown in flat (ungrouped) mode.
const NS_COL_W = 150

function ColumnHeader({ resource, sortKey, sortDir, onSort, showNsColumn }) {
  const key = resource.startsWith('cr:') ? '__cr__' : resource
  const headers = COL_HEADERS[key] || []
  const widths  = COL_WIDTHS[key]  || []
  const nameActive = sortKey === 'name'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 26,
      paddingLeft: 4, paddingRight: 16,
      borderBottom: '1px solid rgba(0,212,255,0.12)',
      background: 'rgba(2,8,24,0.92)',
      position: 'sticky', top: 0, zIndex: 2,
    }}>
      <span style={{ width: 14, flexShrink: 0 }} />
      <span style={{ width: 8,  flexShrink: 0, marginRight: 10 }} />
      {showNsColumn && (
        <span style={{
          width: NS_COL_W, flexShrink: 0, fontSize: 10, letterSpacing: '0.08em',
          color: '#4a7a9a', paddingRight: 8,
        }}>
          NAMESPACE
        </span>
      )}
      <span
        onClick={() => onSort('name')}
        title="Sort by name (Shift+N)"
        style={{
          flex: 1, fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer',
          color: nameActive ? '#00d4ff' : '#4a7a9a',
        }}
      >
        NAME<SortArrow active={nameActive} dir={sortDir} />
      </span>
      {headers.map((h, i) => {
        const sk = SORT_KEYS[h]
        const active = sk && sortKey === sk
        const last = i === headers.length - 1
        return (
          <span
            key={h}
            onClick={sk ? () => onSort(sk) : undefined}
            title={sk ? `Sort by ${sk}` : undefined}
            style={{
              width: widths[i], flexShrink: 0, fontSize: 10,
              color: active ? '#00d4ff' : '#4a7a9a', letterSpacing: '0.08em',
              textAlign: last ? 'right' : 'left',
              paddingLeft: last ? 0 : 8,
              cursor: sk ? 'pointer' : 'default',
            }}
          >
            {h}<SortArrow active={active} dir={sortDir} />
          </span>
        )
      })}
    </div>
  )
}

function NamespaceHeader({ name, count, color, onClick, focused }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', height: 32,
        paddingLeft: 8, paddingRight: 16, cursor: 'pointer',
        background: focused ? `${color}12` : 'transparent',
        borderLeft: `3px solid ${color}`, marginTop: 4,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!focused) e.currentTarget.style.background = `${color}08` }}
      onMouseLeave={e => { if (!focused) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontSize: 10, fontWeight: 'bold', color, letterSpacing: '0.12em', flex: 1 }}>
        {name.toUpperCase()}
      </span>
      <span style={{ fontSize: 10, color: `${color}88` }}>{count}</span>
    </div>
  )
}

export function ResourceList() {
  const activeResource     = useStore(s => s.activeResource)
  const activeNamespace    = useStore(s => s.activeNamespace)
  const crdResources       = useStore(s => s.crdResources)
  const drilldownItems     = useStore(s => s.drilldownItems)
  const storeItems         = useStore(s => s[activeResource])
  const selectedId         = useStore(s => s.selectedId)
  const selectedIds        = useStore(s => s.selectedIds)
  const filter             = useStore(s => s.filter)
  const sortKey            = useStore(s => s.sortKey)
  const sortDir            = useStore(s => s.sortDir)
  const faultsOnly         = useStore(s => s.faultsOnly)
  const groupByNamespace   = useStore(s => s.groupByNamespace)
  const setSelected        = useStore(s => s.setSelected)
  const setSort            = useStore(s => s.setSort)
  const toggleMultiSelect  = useStore(s => s.toggleMultiSelect)
  const setActiveNamespace = useStore(s => s.setActiveNamespace)

  const allItems = drilldownItems
    ?? (activeResource.startsWith('cr:')
      ? (crdResources[activeResource.slice(3)] || [])
      : (storeItems || []))

  // Only non-empty namespaces → if all empty it's cluster-scoped
  const allNamespaces = useMemo(
    () => [...new Set(allItems.map(i => i.namespace).filter(Boolean))],
    [allItems]
  )

  const displayItems = useMemo(() => {
    let items = allItems
    if (activeNamespace !== 'all') items = items.filter(i => i.namespace === activeNamespace)
    if (filter) {
      const q = filter.toLowerCase()
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) || (i.namespace || '').toLowerCase().includes(q)
      )
    }
    if (faultsOnly) items = items.filter(isFault)
    return arrangeForDisplay(items, { activeNamespace, sortKey, sortDir, groupByNamespace })
  }, [allItems, activeNamespace, filter, faultsOnly, sortKey, sortDir, groupByNamespace])

  // Grouped (namespace headers) only when opted in via ctrl+g; otherwise a flat
  // k9s-style list with NAMESPACE as a column.
  const showNsHeaders = groupByNamespace && activeNamespace === 'all' && allNamespaces.length > 0
  const showNsColumn  = !groupByNamespace && activeNamespace === 'all' && allNamespaces.length > 0

  // In grouped mode, bucket by namespace (alphabetical). In flat mode, render a single
  // group so the globally-sorted displayItems order is preserved verbatim.
  const groups = useMemo(() => {
    if (!showNsHeaders) return [['', displayItems]]
    const map = {}
    displayItems.forEach(item => {
      const key = item.namespace || ''
      if (!map[key]) map[key] = []
      map[key].push(item)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [displayItems, showNsHeaders])

  const displayName = activeResource.startsWith('cr:') ? activeResource.slice(3).split('/').pop() : activeResource
  let rowIndex = 0

  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
      <ColumnHeader resource={activeResource} sortKey={sortKey} sortDir={sortDir} onSort={setSort} showNsColumn={showNsColumn} />

      {displayItems.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12, color: '#3a5a7a', fontFamily: 'inherit' }}>
          {faultsOnly ? `No ${displayName} with faults`
            : filter ? `No ${displayName} match "${filter}"`
            : `No ${displayName} found`}
        </div>
      )}

      {groups.map(([ns, items]) => {
        const nsColor = ns ? getNsColor(ns, allNamespaces) : '#2a4a6a'
        return (
          <div key={ns || '__cluster__'}>
            {showNsHeaders && ns && (
              <NamespaceHeader
                name={ns} count={items.length} color={nsColor}
                focused={activeNamespace === ns}
                onClick={() => setActiveNamespace(activeNamespace === ns ? 'all' : ns)}
              />
            )}
            {items.map((item, itemIdx) => {
              const delay = (rowIndex++) * 18
              const isSelected = selectedId === item.id
              const isMulti = selectedIds.has(item.id)
              return (
                <ResourceRow
                  key={item.id}
                  item={item} resource={activeResource}
                  selected={isSelected} multiSelected={isMulti}
                  scrollIntoView={isSelected}
                  animDelay={delay}
                  firstInGroup={showNsHeaders && !!ns && itemIdx === 0}
                  nsColumnWidth={showNsColumn ? NS_COL_W : 0}
                  nsColor={showNsColumn && item.namespace ? getNsColor(item.namespace, allNamespaces) : null}
                  onSelect={() => setSelected(isSelected ? null : item.id)}
                  onToggleMulti={() => toggleMultiSelect(item.id)}
                />
              )
            })}
          </div>
        )
      })}

      <div style={{ height: 8 }} />
    </div>
  )
}
