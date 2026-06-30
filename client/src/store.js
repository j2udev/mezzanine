import { create } from 'zustand'
import { applyTheme, getStoredThemeId } from './theme'
import { getToken, setToken, clearToken } from './lib/auth'
import { AWS_RESOURCE_KEYS, AWS_ALIASES } from './aws/resources'

// mezza9 is multi-provider (build-then-extract, see modules.md). The active provider is a thin
// display selector: k8s is the default, AWS is module #2. A resource key maps to exactly one
// provider; switching providers resets to that provider's default resource.
const PROVIDER_DEFAULTS = { k8s: 'pods', aws: 's3buckets' }
export const resourceProvider = (r) => (AWS_RESOURCE_KEYS.has(r) ? 'aws' : 'k8s')

// Snapshot of the current view, pushed onto navStack so `[`/`]` can restore it. Drilldowns,
// owner-jumps AND plain resource switches all record one, so history works browser-style (#79).
const navFrame = (s) => ({
  resource: s.activeResource, selectedId: s.selectedId, namespace: s.activeNamespace,
  filter: s.filter, filterPinned: s.filterPinned,
  drilldownItems: s.drilldownItems, drilldownLabel: s.drilldownLabel,
})

// Cap the back-history so the trail can't grow without bound (#17). The newest MAX_NAV_STACK
// frames are kept; older ones drop off the left. `[`/`]` and the footer carousel operate on
// whatever is retained. Push helper used everywhere a frame is recorded.
const MAX_NAV_STACK = 50
const pushNav = (stack, frame) => {
  const next = [...stack, frame]
  return next.length > MAX_NAV_STACK ? next.slice(next.length - MAX_NAV_STACK) : next
}

export const CLUSTER_SCOPED_RESOURCES = new Set([
  'nodes', 'pvs', 'namespaces', 'crds', 'clusterroles', 'clusterrolebindings', 'storageclasses',
])

// ── Scope axis (modules.md friction #1, now extracted) ───────────────────────
// The "scope axis" is a provider's primary filtering dimension: k8s scopes resources by NAMESPACE,
// aws by REGION. The active scope VALUE lives in `activeNamespace` ('all' = unscoped). This is the
// generic, provider-supplied replacement for the hardcoded namespace the cross-provider interface
// wants. AWS rows carry a `region`, so they are region-scoped (NOT "cluster scoped"); only truly
// global services (IAM etc. - none yet) are exempt via AWS_GLOBAL_SCOPED.
const AWS_GLOBAL_SCOPED = new Set([])
export const scopeFieldFor = (provider) => (provider === 'aws' ? 'region' : 'namespace')
export const scopeLabelFor = (provider) => (provider === 'aws' ? 'region' : 'namespace')
// Resource exempt from scope filtering (global within its provider). Resource keys are unique across
// providers, so one predicate covers both.
export const isGlobalScopedResource = (r) => CLUSTER_SCOPED_RESOURCES.has(r) || AWS_GLOBAL_SCOPED.has(r)

const K8S_ALIASES = {
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

// Full alias map (k8s + aws), kept for display / back-compat. RESOLUTION is provider-scoped via
// aliasesForProvider(): because the provider is fixed at deploy time (module #2), a k8s deployment
// never resolves :s3 and an aws deployment never resolves :pods - each is a single-provider app.
export const RESOURCE_ALIASES = { ...K8S_ALIASES, ...AWS_ALIASES }
export const aliasesForProvider = (p) => (p === 'aws' ? AWS_ALIASES : K8S_ALIASES)

// Resource types that support Enter drill-down
export const DRILLABLE = new Set(['deployments', 'statefulsets', 'daemonsets', 'services', 'cronjobs', 'jobs', 'pods'])

// RBAC resource types - Enter / p opens the k9s-style policy / rules view (task 94)
export const RBAC_RESOURCES = new Set(['roles', 'clusterroles', 'rolebindings', 'clusterrolebindings', 'serviceaccounts'])

// Resource types that can be port-forwarded (shift+f)
export const FORWARDABLE = new Set(['pods', 'services', 'deployments', 'statefulsets'])

// Resource types whose items carry an `owner` jump target (shift+j)
export const OWNED = new Set(['pods', 'replicasets', 'jobs'])

// Map an internal resource key to the kubectl resource identifier used in API paths
// (describe/yaml/json/delete). Custom-resource lists are keyed `cr:group/version/plural`;
// kubectl addresses those instances as `<plural>.<group>` (e.g. servicemonitors.monitoring.coreos.com),
// which is a single path segment (no slash), so it slots straight into the API route. Native
// resources pass through unchanged. (task 21)
export function kubectlResource(resource) {
  if (!resource.startsWith('cr:')) return resource
  const [group, , plural] = resource.slice(3).split('/')
  return group ? `${plural}.${group}` : plural
}

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
export function arrangeForDisplay(items, { activeNamespace, sortKey, sortDir, groupByNamespace, scopeField = 'namespace' }) {
  const scoped = items.some(i => i[scopeField])
  const grouped = groupByNamespace && activeNamespace === 'all' && scoped
  if (!grouped) return sortItems(items, sortKey, sortDir)
  const groups = {}
  items.forEach(i => { const k = i[scopeField] || ''; (groups[k] ||= []).push(i) })
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
  // AWS provider data (module #2). s3buckets/ec2instances arrive in the shared stream; s3objects is
  // populated only by the lazy bucket drill (drillIntoBucket), never broadcast.
  s3buckets: [],
  ec2instances: [],
  s3objects: [],
  ebsvolumes: [],
  lambdafunctions: [],
  vpcs: [],
  securitygroups: [],
  elasticips: [],
  awsConnected: false,    // backend reached live AWS
  awsDemo: false,         // serving mock AWS (MEZZ_AWS_DEMO) - separate from k8s demoMode (friction #7)
  awsRegion: null,
  awsIdentity: null,
  awsError: null,
  selectedIds: new Set(), // multi-select
  demoMode: false,
  connected: false,          // WebSocket transport connection
  clusterConnected: false,   // backend reached a live k8s cluster
  clusterError: null,        // reason the cluster is unreachable (shown by NotConnected)

  // Auth gate (task 97). authChecked = boot probe finished; authRequired = the server has a
  // token gate; authed = we hold a valid token (or there is no gate). authError = last login
  // failure message. Until authed, useWS stays disconnected and App renders the login screen.
  authChecked: false,
  authRequired: false,
  authed: false,
  authBusy: false,
  authError: null,

  // Current view
  activeProvider: 'k8s',   // 'k8s' | 'aws' - FIXED per deployment (module #2), set once at boot by
                           // initProvider() from /api/health. No runtime switcher; drives the shell.
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
  // History trail on/off (#17). When off, the footer carousel is hidden, but nav state is
  // NOT cleared - `[`/`]` still work and flipping it back on shows the existing trail again.
  // Persisted so it survives reloads.
  historyEnabled: (() => { try { return localStorage.getItem('mezz-history') !== 'off' } catch { return true } })(),

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
  debugModal: null,      // { namespace, pod, target, containers, label } when the debug dialog is open (#82)
  cpModal: null,         // { namespace, pod, container, containers, label } when the copy dialog is open (#108)
  s3CpModal: null,       // { bucket, objectKey, label } when the S3 copy dialog is open (module #2)
  relatedModal: null,    // { label, loading, links, error } when the AWS related-resources view is open (phase 1)
  deleteConfirm: null,   // { item, resource } when ctrl+d confirm is pending

  setData: (data) => set(data),
  setConnected: (v) => set({ connected: v }),

  // Boot probe (task 97): ask the public /api/health whether a token is required. If not, we're
  // authed. If so, verify any stored token; a valid one keeps us in, otherwise show the login
  // screen. Network failure here is treated as "no gate" - NotConnected then covers the offline
  // state, and the gate (if any) still rejects every real /api call regardless.
  initAuth: async () => {
    // Probe the public /api/health to learn whether a token is required. Retry a few times so a
    // transient blip (server mid-restart) doesn't drop us into a broken authed shell; only after
    // repeated failure do we assume no gate. Either way the server still 401s every real call, and
    // requireReauth (below) flips us to the login screen on the first 401 if we guessed wrong.
    let h = null
    for (let attempt = 0; attempt < 4 && !h; attempt++) {
      try { h = await fetch('/api/health').then(r => (r.ok ? r.json() : null)) } catch { h = null }
      if (!h) await new Promise(r => setTimeout(r, 1000))
    }
    // Pick up this deployment's provider (module #2) from the public health probe, before the
    // dashboard first renders, so it boots straight into the right provider's shell.
    if (h?.provider) get().initProvider(h.provider)
    const required = !!(h && h.authRequired)
    if (!required) { set({ authChecked: true, authRequired: false, authed: true }); return }
    if (getToken()) {
      const ok = await fetch('/api/auth/verify').then(r => r.ok).catch(() => false)
      set({ authChecked: true, authRequired: true, authed: ok })
    } else {
      set({ authChecked: true, authRequired: true, authed: false })
    }
  },
  // Store the token, verify it against the gate, and keep it only if accepted.
  login: async (raw) => {
    const t = (raw || '').trim()
    if (!t) { set({ authError: 'Enter a token' }); return false }
    set({ authBusy: true, authError: null })
    setToken(t)
    const ok = await fetch('/api/auth/verify').then(r => r.ok).catch(() => false)
    if (ok) { set({ authed: true, authBusy: false, authError: null }); return true }
    clearToken()
    set({ authed: false, authBusy: false, authError: 'Invalid token' })
    return false
  },
  logout: () => { clearToken(); set({ authed: false, authError: null }) },
  // Fired by the fetch interceptor on any /api 401. A 401 only ever comes from the auth gate, so
  // it is definitive proof the gate is on - mark authRequired true and drop to the login screen.
  // This also self-corrects a boot probe that wrongly guessed "no gate" (e.g. a health-probe blip).
  requireReauth: () => set({ authRequired: true, authed: false }),

  setActiveResource: (r) => set(s => ({
    activeResource: r, activeProvider: resourceProvider(r),
    selectedId: null, selectedIds: new Set(), filter: '', filterActive: false, filterPinned: false,
    // Record the view we're leaving so `[` can come back to it (skip self-switches). (#79)
    navStack: r === s.activeResource ? s.navStack : pushNav(s.navStack, navFrame(s)),
    navFuture: [], drilldownItems: null, drilldownLabel: '',
    nsPickerMode: false, previousResource: null,
    sortKey: null, sortDir: 'asc',
  })),

  // Set this deployment's provider ONCE at boot, from /api/health (module #2). The provider is fixed
  // per-deploy - there is no runtime switcher - so this just snaps the shell to the right provider
  // and its home resource. Called from initAuth before the dashboard first renders.
  initProvider: (provider) => set(s => {
    const p = provider === 'aws' ? 'aws' : 'k8s'
    if (p === s.activeProvider) return {}
    return { activeProvider: p, activeResource: PROVIDER_DEFAULTS[p] || 'pods', selectedId: null, drilldownItems: null, drilldownLabel: '' }
  }),
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
  toggleHistory: () => set(s => {
    const next = !s.historyEnabled
    try { localStorage.setItem('mezz-history', next ? 'on' : 'off') } catch { /* ignore */ }
    return { historyEnabled: next }
  }),
  // Clear/reset the history trail (#22). Wipes both back and forward stacks but leaves the
  // current view untouched - distinct from toggleHistory, which only hides/shows the trail.
  clearHistory: () => set({ navStack: [], navFuture: [] }),

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

    // ns / namespace (no arg) → namespace picker (k8s only - AWS has no namespace axis)
    if (get().activeProvider === 'k8s' && (trimmed === 'ns' || trimmed === 'namespace')) {
      get().enterNsPickerMode()
      set({ commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }
    // ns <name> → direct set (k8s only)
    if (get().activeProvider === 'k8s' && (trimmed.startsWith('ns ') || trimmed.startsWith('namespace '))) {
      const ns = trimmed.split(/\s+/).slice(1).join(' ')
      set({ activeNamespace: ns || 'all', commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }
    // region (aws scope axis): ':region <name>' scopes to a region; ':region' or ':region all' clears.
    if (get().activeProvider === 'aws' && (trimmed === 'region' || trimmed === 'reg' || trimmed.startsWith('region ') || trimmed.startsWith('reg '))) {
      const r = trimmed.split(/\s+/).slice(1).join(' ')
      set({ activeNamespace: (!r || r === 'all') ? 'all' : r, commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      return true
    }

    // whoami / can-i → self access review modal (task 94; k8s only)
    if (get().activeProvider === 'k8s' && ['whoami', 'cani', 'can-i', 'access', 'rbac'].includes(trimmed)) {
      set({ commandActive: false, command: '', filterActive: false, filterMode: 'str' })
      get().openWhoami()
      return true
    }

    // Resolution is scoped to THIS deployment's provider (module #2) - aliases for the other
    // provider simply don't resolve here.
    const resolved = aliasesForProvider(get().activeProvider)[trimmed]
    if (resolved) {
      const s = get()
      set({
        activeResource: resolved, activeProvider: resourceProvider(resolved),
        selectedId: null, selectedIds: new Set(), filter: '', filterActive: false, filterPinned: false,
        navStack: resolved === s.activeResource ? s.navStack : pushNav(s.navStack, navFrame(s)),
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
      activeProvider: 'k8s',
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
      activeProvider: resourceProvider(s.previousResource || 'pods'),
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
      activeProvider: resourceProvider(target.resource),
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
      activeProvider: resourceProvider(prev.resource),
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
      activeProvider: resourceProvider(next.resource),
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
      activeResource: `cr:${key}`, activeProvider: 'k8s', selectedId: null, filter: '', filterActive: false, filterPinned: false,
      navStack: `cr:${key}` === s.activeResource ? s.navStack : pushNav(s.navStack, navFrame(s)),
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
      fetch(`/api/delete/${kubectlResource(s.activeResource)}/${ns}/${item.name}`, { method: 'DELETE' }).catch(() => {})
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

  // Self access review - "what can the dashboard's identity do?" (task 94). Not tied to a
  // selected object, so it opens the policy modal with a synthetic item + whoami flag.
  // Scoped to the active namespace (SelfSubjectRulesReview is namespace-scoped).
  openWhoami: () => {
    const s = get()
    const ns = s.activeNamespace && s.activeNamespace !== 'all' ? s.activeNamespace : 'default'
    set({ modal: { type: 'policy', whoami: true, resource: 'whoami', item: { id: 'whoami', name: 'access-review', namespace: ns } } })
  },

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

  // Debug into a pod with an ephemeral container (#82), kubectl-debug style. Opens the debug
  // dialog (image + target container picker); on submit it injects the container server-side
  // and then hands off to the shell terminal (execModal) bound to that ephemeral container.
  // `target` = the container whose process namespace the debugger shares (a distroless app
  // container that has no shell of its own can still be inspected this way).
  openDebug: () => {
    const s = get()
    if (!s.selectedId) return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (!item) return
    if (s.activeResource === 'containers') {
      set({ debugModal: { namespace: item.namespace, pod: item.pod, target: item.name, containers: [item.name], label: `${item.pod} / ${item.name}` } })
    } else if (s.activeResource === 'pods') {
      const containers = (item.containers || []).map(c => typeof c === 'string' ? c : c?.name).filter(Boolean)
      set({ debugModal: { namespace: item.namespace, pod: item.name, target: containers[0] || '', containers, label: item.name } })
    }
  },
  closeDebug: () => set({ debugModal: null }),
  // Hand off from the debug dialog to the shell terminal once the ephemeral container is up.
  debugToShell: ({ namespace, pod, container, label }) =>
    set({ debugModal: null, execModal: { namespace, pod, container, label } }),
  // Offered when `s` finds no shell in a container: close the terminal and open the debug
  // dialog for the same pod/container (an ephemeral busybox/netshoot container brings its own
  // shell, so a distroless pod becomes inspectable).
  execToShellDebug: () => {
    const e = get().execModal
    if (!e) return
    set({ execModal: null, debugModal: { namespace: e.namespace, pod: e.pod, target: e.container, containers: e.container ? [e.container] : [], label: e.label } })
  },

  // Copy files to/from a pod or container - kubectl cp style (#108). Mirrors openExec/openDebug:
  // a container-drilldown row carries { pod, name(=container) }; a pod row carries containers[]
  // and defaults to the first container (switchable in the dialog).
  openCp: () => {
    const s = get()
    if (!s.selectedId) return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (!item) return
    if (s.activeResource === 'containers') {
      set({ cpModal: { namespace: item.namespace, pod: item.pod, container: item.name, containers: [item.name], label: `${item.pod} / ${item.name}` } })
    } else if (s.activeResource === 'pods') {
      const containers = (item.containers || []).map(c => typeof c === 'string' ? c : c?.name).filter(Boolean)
      set({ cpModal: { namespace: item.namespace, pod: item.name, container: containers[0] || '', containers, label: item.name } })
    }
  },
  closeCp: () => set({ cpModal: null }),

  // ── AWS provider actions (module #2) ─────────────────────────────────────────
  // Drill into a bucket's objects. Unlike the k8s pod->containers drill (sync, children embedded in
  // the parent row), S3 objects are fetched lazily and paginated - so this is async and can't use
  // getDrillTarget (friction #3). useKeys special-cases Enter on s3buckets to call this.
  drillIntoBucket: async (item) => {
    const s = get()
    const label = `${item.name} › objects`
    set({
      navStack: pushNav(s.navStack, navFrame(s)), navFuture: [],
      activeResource: 's3objects', activeProvider: 'aws',
      drilldownItems: [], drilldownLabel: label,
      selectedId: null, selectedIds: new Set(),
      filter: '', filterActive: false, filterPinned: false,
      sortKey: null, sortDir: 'asc',
    })
    try {
      const res = await fetch(`/api/aws/s3/${encodeURIComponent(item.name)}`)
      const { objects } = await res.json()
      // Only apply if the user is still on this exact drilldown (they may have navigated away).
      set(st => (st.activeResource === 's3objects' && st.drilldownLabel === label) ? { drilldownItems: objects || [] } : {})
    } catch (err) {
      console.warn('S3 objects fetch failed:', err.message)
      set(st => st.activeResource === 's3objects' ? { drilldownItems: [] } : {})
    }
  },

  // EC2 state transitions (start/stop/reboot/terminate). Multi-select aware, fire-and-forget like
  // killSelected, but POST to the per-region op route (region is on each row). The next refresh
  // reflects the new state. Writes refuse server-side in AWS demo mode.
  ec2Action: (op) => {
    const s = get()
    if (s.activeResource !== 'ec2instances') return
    let targets = []
    if (s.selectedIds.size > 0) targets = s.getFilteredItems().filter(i => s.selectedIds.has(i.id))
    else if (s.selectedId) { const it = s.getFilteredItems().find(i => i.id === s.selectedId); if (it) targets = [it] }
    if (!targets.length) return
    targets.forEach(t => fetch(`/api/aws/ec2/${encodeURIComponent(t.region)}/${encodeURIComponent(t.id)}/${op}`, { method: 'POST' }).catch(() => {}))
    s.clearMultiSelect()
  },

  // Open the S3 copy dialog (download/upload). On a bucket it opens with no key; on an object it
  // prefills the object key for a one-click download. The "local" side is the browser, like CopyModal.
  openS3Cp: () => {
    const s = get()
    if (!s.selectedId) return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (!item) return
    if (s.activeResource === 's3buckets') set({ s3CpModal: { bucket: item.name, objectKey: '', label: item.name } })
    else if (s.activeResource === 's3objects') set({ s3CpModal: { bucket: item.bucket, objectKey: item.name, label: `${item.bucket}/${item.name}` } })
  },
  closeS3Cp: () => set({ s3CpModal: null }),

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
      navStack: pushNav(s.navStack, navFrame(s)), navFuture: [],
      activeResource: owner.resource, activeProvider: resourceProvider(owner.resource), drilldownItems: null, drilldownLabel: '',
      activeNamespace: owner.namespace || s.activeNamespace,
      filter: '', filterActive: false, filterPinned: false,
      sortKey: null, sortDir: 'asc',
      selectedId: target.id, selectedIds: new Set(),
    })
  },

  // ── AWS related resources (phase 1) ──────────────────────────────────────────
  // Open the typed "connected resources" view for the selected AWS resource. The AWS analog of
  // jumpToOwner, but multi-edge: fetches /api/aws/related and shows a pick-list the user Enters into.
  // Mirrors drillIntoBucket's async fetch-and-apply-if-still-open guard so a late response doesn't
  // clobber a modal the user already closed/changed.
  openRelated: () => {
    const s = get()
    if (!s.selectedId || s.activeProvider !== 'aws') return
    const item = s.getItems().find(i => i.id === s.selectedId)
    if (!item) return
    const label = item.name || item.id
    set({ relatedModal: { label, loading: true, links: [], error: null } })
    const url = `/api/aws/related/${s.activeResource}/${encodeURIComponent(item.region || '')}/${encodeURIComponent(item.id)}`
    fetch(url)
      .then(r => r.json())
      .then(({ links, error }) => set(st => st.relatedModal?.label === label
        ? { relatedModal: { ...st.relatedModal, loading: false, links: links || [], error: error || null } } : {}))
      .catch(err => set(st => st.relatedModal?.label === label
        ? { relatedModal: { ...st.relatedModal, loading: false, error: err.message } } : {}))
  },
  closeRelated: () => set({ relatedModal: null }),

  // Teleport to a related resource (generalizes jumpToOwner): switch to the target resource type,
  // select the linked row, push a nav frame so `[`/Esc returns. Guards on the target existing in
  // the current data stream (cross-account/region links won't be present) - returns false if not,
  // so the modal can surface "not in this view".
  jumpToRelated: (link) => {
    const s = get()
    if (!link) return false
    const target = (s[link.resource] || []).find(i => i.id === link.id || i.name === link.id)
    if (!target) return false
    set({
      relatedModal: null,
      navStack: pushNav(s.navStack, navFrame(s)), navFuture: [],
      activeResource: link.resource, activeProvider: resourceProvider(link.resource),
      drilldownItems: null, drilldownLabel: '',
      activeNamespace: 'all',
      filter: '', filterActive: false, filterPinned: false,
      sortKey: null, sortDir: 'asc',
      selectedId: target.id, selectedIds: new Set(),
    })
    return true
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
    // Cluster-scoped resources (namespaces, nodes, pvs, CRDs, etc.) have no namespace, so
    // the active-namespace scope must NOT apply to them - otherwise selecting a namespace
    // empties the namespace picker (and the nodes/pvs lists). #91
    const scopeField = scopeFieldFor(s.activeProvider)
    if (s.activeNamespace !== 'all' && !isGlobalScopedResource(s.activeResource)) {
      items = items.filter(i => i[scopeField] === s.activeNamespace)
    }
    if (s.filter) {
      const q = s.filter.toLowerCase()
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i[scopeField] || '').toLowerCase().includes(q)
      )
    }
    if (s.faultsOnly) items = items.filter(isFault)
    return arrangeForDisplay(items, { activeNamespace: s.activeNamespace, sortKey: s.sortKey, sortDir: s.sortDir, groupByNamespace: s.groupByNamespace, scopeField })
  },
}))
