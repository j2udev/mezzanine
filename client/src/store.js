import { create } from 'zustand'
import { applyTheme, getStoredThemeId } from './theme'

// Snapshot of the current view, pushed onto navStack so `[`/`]` can restore it. Drilldowns,
// owner-jumps AND plain resource switches all record one, so history works browser-style (#79).
const navFrame = (s) => ({
  resource: s.activeResource, selectedId: s.selectedId, namespace: s.activeNamespace,
  filter: s.filter, filterPinned: s.filterPinned,
  drilldownItems: s.drilldownItems, drilldownLabel: s.drilldownLabel,
})

export const CLUSTER_SCOPED_RESOURCES = new Set([
  'nodes', 'pvs', 'namespaces', 'crds', 'clusterroles', 'clusterrolebindings', 'storageclasses',
])

export const RESOURCE_ALIASES = {
  p: 'pods', pod: 'pods', pods: 'pods',
  d: 'deployments', dep: 'deployments', deploy: 'deployments', deployments: 'deployments', deployment: 'deployments',
  rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets',
  s: 'services', svc: 'services', service: 'services', services: 'services',
  ss: 'statefulsets', sts: 'statefulsets', statefulset: 'statefulsets', statefulsets: 'statefulsets',
  ds: 'daemonsets', daemonset: 'daemonsets', daemonsets: 'daemonsets',
  j: 'jobs', job: 'jobs', jobs: 'jobs',
  cj: 'cronjobs', cronjob: 'cronjobs', cronjobs: 'cronjobs',
  hpa: 'hpa', horizontalpodautoscaler: 'hpa', horizontalpodautoscalers: 'hpa',
  pdb: 'pdb', poddisruptionbudget: 'pdb', poddisruptionbudgets: 'pdb',
  ing: 'ingresses', ingress: 'ingresses', ingresses: 'ingresses',
  netpol: 'networkpolicies', networkpolicy: 'networkpolicies', networkpolicies: 'networkpolicies',
  cm: 'configmaps', configmap: 'configmaps', configmaps: 'configmaps',
  sec: 'secrets', secret: 'secrets', secrets: 'secrets',
  sa: 'serviceaccounts', serviceaccount: 'serviceaccounts', serviceaccounts: 'serviceaccounts',
  rq: 'resourcequotas', quota: 'resourcequotas', resourcequota: 'resourcequotas', resourcequotas: 'resourcequotas',
  pvc: 'pvcs', pvcs: 'pvcs',
  pv: 'pvs', pvs: 'pvs',
  sc: 'storageclasses', storageclass: 'storageclasses', storageclasses: 'storageclasses',
  role: 'roles', roles: 'roles',
  clusterrole: 'clusterroles', clusterroles: 'clusterroles',
  rb: 'rolebindings', rolebinding: 'rolebindings', rolebindings: 'rolebindings',
  crb: 'clusterrolebindings', clusterrolebinding: 'clusterrolebindings', clusterrolebindings: 'clusterrolebindings',
  no: 'nodes', node: 'nodes', nodes: 'nodes',
  namespaces: 'namespaces',
  ev: 'events', event: 'events', events: 'events',
  crd: 'crds', crds: 'crds',
  helm: 'helmreleases', helmreleases: 'helmreleases',
  pf: 'portforwards', portforward: 'portforwards', portforwards: 'portforwards', forwards: 'portforwards',
}

// Resource types that support Enter drill-down
export const DRILLABLE = new Set(['deployments', 'statefulsets', 'daemonsets', 'services', 'cronjobs', 'jobs', 'pods'])

// Resource types that can be port-forwarded (shift+f)
export const FORWARDABLE = new Set(['pods', 'services', 'deployments', 'statefulsets'])

// Resource types whose items carry an `owner` jump target (shift+j)
export const OWNED = new Set(['pods', 'replicasets', 'jobs'])

// ── Sorting & fault detection ────────────────────────────────────────────────

const HEALTHY_STATUSES = new Set([
  'Running', 'Available', 'Active', 'Complete', 'Completed', 'Succeeded',
  'Bound', 'Ready', 'Deployed', 'Normal',
])

// Statuses that are terminal-success / settled - never faults even when ready is 0/1
// (a completed Job pod reports 0/1 by design; a Bound PVC has no readiness).
const TERMINAL_OK_STATUSES = new Set(['Succeeded', 'Complete', 'Completed', 'Bound'])

// A resource is a "fault" if its status isn't healthy, or (for non-terminal resources)
// its readiness is incomplete.
export function isFault(item) {
  if (item.status && !HEALTHY_STATUSES.has(item.status)) return true
  if (item.status && TERMINAL_OK_STATUSES.has(item.status)) return false
  const m = /^(\d+)\/(\d+)$/.exec(item.ready || '')
  if (m && Number(m[1]) < Number(m[2])) return true
  return false
}

// Parse a humanized age string ("5d", "3h", "45s", "1h2m") into seconds.
// Items without an age sort last (Infinity).
export function parseAge(age) {
  if (!age) return Infinity
  const units = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 }
  const re = /(\d+)\s*([smhdwy])/g
  let total = 0, matched = false, mm
  while ((mm = re.exec(age))) { total += Number(mm[1]) * units[mm[2]]; matched = true }
  return matched ? total : Infinity
}

function comparator(sortKey) {
  switch (sortKey) {
    case 'name':   return (a, b) => (a.name   || '').localeCompare(b.name   || '')
    case 'status': return (a, b) => (a.status || '').localeCompare(b.status || '')
    case 'age':    return (a, b) => parseAge(a.age) - parseAge(b.age)
    default:       return null
  }
}

export function sortItems(items, sortKey, sortDir) {
  const cmp = comparator(sortKey)
  if (!cmp) return items
  const sorted = [...items].sort(cmp)
  return sortDir === 'desc' ? sorted.reverse() : sorted
}

// Produce the flat list in the exact order it is displayed: grouped by namespace
// (namespace name order, matching ResourceList) only when namespace grouping is opted
// into AND the "all namespaces" view is active AND namespaced items exist - otherwise a
// flat list (k9s default) sorted as a whole.
// Keeping nav (j/k) and the visible list in lockstep depends on this single ordering.
export function arrangeForDisplay(items, { activeNamespace, sortKey, sortDir, groupByNamespace }) {
  const namespaced = items.some(i => i.namespace)
  const grouped = groupByNamespace && activeNamespace === 'all' && namespaced
  if (!grouped) return sortItems(items, sortKey, sortDir)
  const groups = {}
  items.forEach(i => { const k = i.namespace || ''; (groups[k] ||= []).push(i) })
  return Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .flatMap(k => sortItems(groups[k], sortKey, sortDir))
}

export const useStore = create((set, get) => ({
  // Resource data
  pods: [],
  deployments: [],
  replicasets: [],
  services: [],
  statefulsets: [],
  daemonsets: [],
  jobs: [],
  cronjobs: [],
  hpa: [],
  pdb: [],
  ingresses: [],
  networkpolicies: [],
  configmaps: [],
  secrets: [],
  serviceaccounts: [],
  resourcequotas: [],
  pvcs: [],
  pvs: [],
  storageclasses: [],
  roles: [],
  clusterroles: [],
  rolebindings: [],
  clusterrolebindings: [],
  nodes: [],
  namespaces: [],
  events: [],
  crds: [],
  crdResources: {},
  helmreleases: [],
  portforwards: [],       // active kubectl port-forwards (k9s-style table, #53)
  selectedIds: new Set(), // multi-select
  demoMode: false,
  connected: false,          // WebSocket transport connection
  clusterConnected: false,   // backend reached a live k8s cluster
  clusterError: null,        // reason the cluster is unreachable (shown by NotConnected)

  // Current view
  activeResource: 'pods',
  activeNamespace: 'all',
  selectedId: null,
  filter: '',
  filterActive: false,
  filterPinned: false,
  // Top-right search box mode (#70): 'str' = filter the current list by name/namespace,
  // 'res' = pick/switch the active resource (autocomplete + dropdown). `command` holds the
  // resource-mode text (shared with submitCommand / the `:` flow).
  filterMode: 'str',

  // Sorting & fault filter
  sortKey: null,      // 'name' | 'age' | 'status' | null (server order)
  sortDir: 'asc',     // 'asc' | 'desc'
  faultsOnly: false,  // ctrl+z: show only unhealthy resources

  // View: flat k9s-style list (namespace as a column) by default; opt into
  // namespace-grouped headers with ctrl+g.
  groupByNamespace: false,

  // Help overlay
  helpOpen: false,

  // Theme (#14). themeId drives a re-render of JS-computed colors (statusColor/getNsColor)
  // on switch; CSS-var-based colors repaint on their own via applyTheme().
  themeId: getStoredThemeId(),
  themePickerOpen: false,
  setTheme: (id) => { applyTheme(id); set({ themeId: id }) },
  openThemePicker: () => set({ themePickerOpen: true }),
  closeThemePicker: () => set({ themePickerOpen: false }),
  toggleThemePicker: () => set(s => ({ themePickerOpen: !s.themePickerOpen })),

  // Drill-down navigation
  navStack: [],          // frames for back navigation
  navFuture: [],         // frames for forward navigation
  drilldownItems: null,  // when set, overrides s[activeResource] in list
  drilldownLabel: '',    // e.g. "api-server › pods"

  // Namespace picker mode (:ns command)
  nsPickerMode: false,
  previousResource: null,

  // UI
  sidebarCollapsed: false,
  // Right detail drawer on/off (#todo3). When false the panel never renders, even on
  // selection, freeing the list real estate. Persisted so it survives reloads.
  panelEnabled: (() => { try { return localStorage.getItem('mezz-panel') !== 'off' } catch { return true } })(),
  commandActive: false,
  command: '',
  modal: null,
  pfModal: null,         // { item, resource } when the port-forward dialog is open
  execModal: null,       // { namespace, pod, container, label } when the shell terminal is open (#81)
  deleteConfirm: null,   // { item, resource } when ctrl+d confirm is pending

  setData: (data) => set(data),
  setConnected: (v) => set({ connected: v }),

  setActiveResource: (r) => set(s => ({
    activeResource: r, selectedId: null, selectedIds: new Set(), filter: '', filterActive: false, filterPinned: false,
    // Record the view we're leaving so `[` can come back to it (skip self-switches). (#79)
    navStack: r === s.activeResource ? s.navStack : [...s.navStack, navFrame(s)],
    navFuture: [], drilldownItems: null, drilldownLabel: '',
    nsPickerMode: false, previousResource: null,
    sortKey: null, sortDir: 'asc',
  })),
  setActiveNamespace: (ns) => set({ activeNamespace: ns, selectedId: null, selectedIds: new Set() }),
  setSelected: (id) => set({ selectedId: id }),
  toggleMultiSelect: (id) => set(s => {
    const next = new Set(s.selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedIds: next }
  }),
  clearMultiSelect: () => set({ selectedIds: new Set() }),
  setFilter: (f) => set({ filter: f }),
  setFilterActive: (v) => set({ filterActive: v }),
  setFilterPinned: (v) => set({ filterPinned: v }),
  clearFilter: () => set({ filter: '', filterActive: false, filterPinned: false }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  togglePanel: () => set(s => {
    const next = !s.panelEnabled
    try { localStorage.setItem('mezz-panel', next ? 'on' : 'off') } catch { /* ignore */ }
    return { panelEnabled: next }
  }),

  // Toggle sort direction when the same column is re-selected, else switch column (asc).
  setSort: (key) => set(s => key === s.sortKey
    ? { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' }
    : { sortKey: key, sortDir: 'asc' }),
  clearSort: () => set({ sortKey: null, sortDir: 'asc' }),
  toggleFaults: () => set(s => ({ faultsOnly: !s.faultsOnly })),
  toggleGroupByNamespace: () => set(s => ({ groupByNamespace: !s.groupByNamespace })),
  setHelpOpen: (v) => set({ helpOpen: v }),

  setCommandActive: (v) => set({ commandActive: v, command: '' }),
  setCommand: (c) => set({ command: c }),
  setFilterMode: (m) => set({ filterMode: m }),

  // Resource-mode submit (Enter / dropdown pick in the top-right box, or the legacy `:` flow).
  // Returns true if it switched resource / entered ns picker, so the caller can blur the box.
  submitCommand: (raw) => {
    const trimmed = (raw ?? get().command).trim().toLowerCase()

    // theme → open the theme picker
    if (trimmed === 'theme' || trimmed === 'themes') {
      set({ themePickerOpen: true, commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }

    // ns / namespace (no arg) → namespace picker
    if (trimmed === 'ns' || trimmed === 'namespace') {
      get().enterNsPickerMode()
      set({ commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }
    // ns <name> → direct set
    if (trimmed.startsWith('ns ') || trimmed.startsWith('namespace ')) {
      const ns = trimmed.split(/\s+/).slice(1).join(' ')
      set({ activeNamespace: ns || 'all', commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }

    const resolved = RESOURCE_ALIASES[trimmed]
    if (resolved) {
      const s = get()
      set({
        activeResource: resolved, selectedId: null, selectedIds: new Set(), filter: '', filterActive: false, filterPinned: false,
        navStack: resolved === s.activeResource ? s.navStack : [...s.navStack, navFrame(s)],
        navFuture: [], drilldownItems: null, drilldownLabel: '',
        nsPickerMode: false, previousResource: null,
        sortKey: null, sortDir: 'asc',
        command: '', commandActive: false, filterMode: 'str',
      })
      return true
    }

    // Custom resources (#20): the picker submits a CRD as its `cr:group/version/plural` key
    // (k8s group/version/plural are lowercase, so the earlier .toLowerCase() is safe). Typing
    // a CRD's kind / plural / full name as a bare `:` command also resolves here.
    if (trimmed.startsWith('cr:')) {
      const [group, version, plural] = trimmed.slice(3).split('/')
      if (group && version && plural) {
        set({ command: '', commandActive: false, filterActive: false, filterMode: 'str' })
        get().fetchCrdResources(group, version, plural)
        return true
      }
    }
    const crd = (get().crds || []).find(c =>
      c.kind.toLowerCase() === trimmed || c.plural.toLowerCase() === trimmed || c.name.toLowerCase() === trimmed)
    if (crd) {
      set({ command: '', commandActive: false, filterActive: false, filterMode: 'str' })
      get().fetchCrdResources(crd.group, crd.version, crd.plural)
      return true
    }

    set({ commandActive: false, command: '' })
    return false
  },

  // Namespace picker
  enterNsPickerMode: () => {
    const s = get()
    set({
      nsPickerMode: true,
      previousResource: s.activeResource,
      activeResource: 'namespaces',
      selectedId: null,
      filter: '',
      filterActive: false,
      filterPinned: false,
    })
  },

  exitNsPickerMode: (selectedNamespace) => {
    const s = get()
    set({
      nsPickerMode: false,
      activeResource: s.previousResource || 'pods',
      previousResource: null,
      selectedId: null,
      ...(selectedNamespace !== undefined ? { activeNamespace: selectedNamespace } : {}),
    })
  },

  // Drill-down: compute the target for the currently selected item
  getDrillTarget: (item) => {
    const s = get()
    const resource = s.activeResource

    if (resource === 'deployments') {
      const items = s.pods.filter(p => p.ownerRef === item.id)
      return items.length ? { resource: 'pods', items, label: `${item.name} › pods` } : null
    }

    if (resource === 'statefulsets' || resource === 'daemonsets') {
      const items = s.pods.filter(p =>
        p.namespace === item.namespace && p.name.startsWith(`${item.name}-`)
      )
      return items.length ? { resource: 'pods', items, label: `${item.name} › pods` } : null
    }

    if (resource === 'services') {
      const sel = item.selector
      if (!sel || !Object.keys(sel).length) return null
      const items = s.pods.filter(p =>
        p.namespace === item.namespace &&
        Object.entries(sel).every(([k, v]) => p.labels?.[k] === v)
      )
      return items.length ? { resource: 'pods', items, label: `${item.name} › pods` } : null
    }

    if (resource === 'cronjobs') {
      const items = s.jobs.filter(j =>
        j.namespace === item.namespace && j.name.startsWith(`${item.name}-`)
      )
      return items.length ? { resource: 'jobs', items, label: `${item.name} › jobs` } : null
    }

    if (resource === 'jobs') {
      const items = s.pods.filter(p =>
        p.namespace === item.namespace && p.name.startsWith(`${item.name}-`)
      )
      return items.length ? { resource: 'pods', items, label: `${item.name} › pods` } : null
    }

    if (resource === 'pods') {
      const containers = (item.containers || []).map((c, i) => ({
        id: `${item.id}-cnt-${i}`,
        name: typeof c === 'string' ? c : c.name,
        namespace: item.namespace,
        status: 'Running',
        pod: item.name,
      }))
      return containers.length ? { resource: 'containers', items: containers, label: `${item.name} › containers` } : null
    }

    return null
  },

  drillDown: (target) => {
    const s = get()
    set({
      navStack: [...s.navStack, navFrame(s)],
      navFuture: [],
      activeResource: target.resource,
      drilldownItems: target.items,
      drilldownLabel: target.label,
      selectedId: null,
      filter: '',
      filterActive: false,
      filterPinned: false,
    })
  },

  navBack: () => {
    const s = get()
    if (!s.navStack.length) return
    const prev = s.navStack[s.navStack.length - 1]
    set({
      navStack: s.navStack.slice(0, -1),
      navFuture: [navFrame(s), ...s.navFuture],
      activeResource: prev.resource,
      selectedId: prev.selectedId,
      activeNamespace: prev.namespace,
      filter: prev.filter,
      filterPinned: prev.filterPinned,
      drilldownItems: prev.drilldownItems,
      drilldownLabel: prev.drilldownLabel,
    })
  },

  navForwardStep: () => {
    const s = get()
    if (!s.navFuture.length) return
    const next = s.navFuture[0]
    set({
      navStack: [...s.navStack, navFrame(s)],
      navFuture: s.navFuture.slice(1),
      activeResource: next.resource,
      selectedId: next.selectedId,
      activeNamespace: next.namespace,
      filter: next.filter,
      filterPinned: next.filterPinned,
      drilldownItems: next.drilldownItems,
      drilldownLabel: next.drilldownLabel,
    })
  },

  // Jump `delta` steps through history at once (negative = back, positive = forward), so a
  // footer breadcrumb crumb can navigate straight to its point in the stack. Reuses the
  // single-step ops, which read fresh state each call, so looping composes correctly.
  navGo: (delta) => {
    const step = delta < 0 ? get().navBack : get().navForwardStep
    for (let i = 0; i < Math.abs(delta); i++) step()
  },

  fetchCrdResources: async (group, version, plural) => {
    const key = `${group}/${version}/${plural}`
    set(s => ({
      activeResource: `cr:${key}`, selectedId: null, filter: '', filterActive: false, filterPinned: false,
      navStack: `cr:${key}` === s.activeResource ? s.navStack : [...s.navStack, navFrame(s)],
      navFuture: [], drilldownItems: null, drilldownLabel: '',
    }))
    try {
      const res = await fetch(`/api/crd/${group}/${version}/${plural}`)
      const { items } = await res.json()
      set(s => ({ crdResources: { ...s.crdResources, [key]: items || [] } }))
    } catch (err) {
      console.warn('CRD fetch failed:', err.message)
      set(s => ({ crdResources: { ...s.crdResources, [key]: [] } }))
    }
  },

  setDeleteConfirm: (data) => set({ deleteConfirm: data }),
  cancelDelete: () => set({ deleteConfirm: null }),

  // Stop the selected port-forward(s) and drop them from the table (#53). Used for both
  // ctrl+d and ctrl+k on the portforwards view - stopping a forward is non-destructive
  // (no cluster state changes, trivially re-created), so it needs no confirm dialog. Works
  // in demo mode too (the backend tracks simulated forwards the same way).
  stopSelectedForwards: () => {
    const s = get()
    const all = s.getFilteredItems()
    let targets = []
    if (s.selectedIds.size > 0)  targets = all.filter(i => s.selectedIds.has(i.id))
    else if (s.selectedId)       { const it = all.find(i => i.id === s.selectedId); if (it) targets = [it] }
    if (!targets.length) return
    const ids = new Set(targets.map(t => t.id))
    targets.forEach(t => fetch(`/api/port-forward/${t.id}`, { method: 'DELETE' }).catch(() => {}))
    set(st => ({
      portforwards: st.portforwards.filter(p => !ids.has(p.id)),  // optimistic removal
      selectedIds: new Set(),
      selectedId: ids.has(st.selectedId) ? null : st.selectedId,
    }))
  },

  // Delete with confirmation (ctrl+d / menu). Multi-select aware: confirms all marked
  // items, else the single selected item.
  requestDelete: () => {
    const s = get()
    if (s.activeResource === 'portforwards') return s.stopSelectedForwards()
    if (s.selectedIds.size > 0) {
      const items = s.getFilteredItems().filter(i => s.selectedIds.has(i.id))
      if (items.length) set({ deleteConfirm: { items, resource: s.activeResource } })
    } else if (s.selectedId) {
      const item = s.getFilteredItems().find(i => i.id === s.selectedId)
      if (item) set({ deleteConfirm: { item, resource: s.activeResource } })
    }
  },

  // Instant kill, no confirmation (ctrl+k / menu). Multi-select aware. No-op in demo mode.
  killSelected: () => {
    const s = get()
    if (s.activeResource === 'portforwards') return s.stopSelectedForwards()
    if (s.demoMode) return
    const kill = (item) => {
      const ns = CLUSTER_SCOPED_RESOURCES.has(s.activeResource) ? '_' : (item.namespace || '_')
      fetch(`/api/delete/${s.activeResource}/${ns}/${item.name}`, { method: 'DELETE' }).catch(() => {})
    }
    if (s.selectedIds.size > 0) {
      s.getFilteredItems().filter(i => s.selectedIds.has(i.id)).forEach(kill)
      s.clearMultiSelect()
    } else if (s.selectedId) {
      const item = s.getFilteredItems().find(i => i.id === s.selectedId)
      if (item) kill(item)
    }
  },

  // Actions palette (a): scalable list of every action applicable to the selection
  actionMenuOpen: false,
  openActionMenu: () => { if (get().selectedId) set({ actionMenuOpen: true }) },
  closeActionMenu: () => set({ actionMenuOpen: false }),

  openModal: (type, opts = {}) => {
    const s = get()
    if (!s.selectedId) return
    const items = s.getItems()
    const item = items.find(i => i.id === s.selectedId)
    if (!item) return
    set({ modal: { type, item, resource: s.activeResource, ...opts } })
  },
  closeModal: () => set({ modal: null }),

  // x on a selected secret: jump straight into the inspect modal (YAML) with values decoded
  openSecretDecoded: () => {
    const s = get()
    if (s.activeResource !== 'secrets' || !s.selectedId) return
    s.openModal('yaml', { decoded: true })
  },

  openPortForward: () => {
    const s = get()
    if (!s.selectedId || !FORWARDABLE.has(s.activeResource)) return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (item) set({ pfModal: { item, resource: s.activeResource } })
  },
  closePortForward: () => set({ pfModal: null }),

  // Shell into a pod / container (#81). A container-drilldown row carries { pod, name(=container) };
  // a plain pod row carries containers[] (strings or {name}) - default to its first container.
  openExec: () => {
    const s = get()
    if (!s.selectedId) return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (!item) return
    if (s.activeResource === 'containers') {
      set({ execModal: { namespace: item.namespace, pod: item.pod, container: item.name, label: `${item.pod} / ${item.name}` } })
    } else if (s.activeResource === 'pods') {
      const c0 = (item.containers || [])[0]
      const container = typeof c0 === 'string' ? c0 : c0?.name
      set({ execModal: { namespace: item.namespace, pod: item.name, container, label: item.name } })
    }
  },
  closeExec: () => set({ execModal: null }),

  // Jump to the controller that owns the selected item (shift+j). Pushes a nav frame
  // so `[` returns. No-op if the item has no owner or the owner isn't in current data.
  jumpToOwner: () => {
    const s = get()
    const item = s.getItems().find(i => i.id === s.selectedId)
    const owner = item?.owner
    if (!owner) return
    const target = (s[owner.resource] || []).find(i =>
      i.name === owner.name && (owner.namespace ? i.namespace === owner.namespace : true))
    if (!target) return
    set({
      navStack: [...s.navStack, navFrame(s)], navFuture: [],
      activeResource: owner.resource, drilldownItems: null, drilldownLabel: '',
      activeNamespace: owner.namespace || s.activeNamespace,
      filter: '', filterActive: false, filterPinned: false,
      sortKey: null, sortDir: 'asc',
      selectedId: target.id, selectedIds: new Set(),
    })
  },

  getItems: () => {
    const s = get()
    if (s.drilldownItems) return s.drilldownItems
    if (s.activeResource.startsWith('cr:')) return s.crdResources[s.activeResource.slice(3)] || []
    return s[s.activeResource] || []
  },

  getFilteredItems: () => {
    const s = get()
    let items = s.drilldownItems
      || (s.activeResource.startsWith('cr:') ? (s.crdResources[s.activeResource.slice(3)] || []) : (s[s.activeResource] || []))
    if (s.activeNamespace !== 'all') {
      items = items.filter(i => i.namespace === s.activeNamespace)
    }
    if (s.filter) {
      const q = s.filter.toLowerCase()
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.namespace || '').toLowerCase().includes(q)
      )
    }
    if (s.faultsOnly) items = items.filter(isFault)
    return arrangeForDisplay(items, { activeNamespace: s.activeNamespace, sortKey: s.sortKey, sortDir: s.sortDir, groupByNamespace: s.groupByNamespace })
  },
}))
