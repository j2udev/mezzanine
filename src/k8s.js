import { getMockResources } from './mock.js'

let cachedKc = null
let k8s = null
let lastError = null

// Demo/mock mode is a dev tool, OFF by default. Set MEZZ_DEMO=1 to serve the mock
// cluster when no real cluster is reachable (e.g. UI demos without a kubeconfig).
const DEMO = !!process.env.MEZZ_DEMO &&
  process.env.MEZZ_DEMO !== '0' && process.env.MEZZ_DEMO !== 'false'

const RESOURCE_KEYS = [
  'pods', 'deployments', 'replicasets', 'services',
  'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'hpa', 'pdb',
  'ingresses', 'networkpolicies',
  'configmaps', 'secrets', 'serviceaccounts', 'resourcequotas',
  'pvcs', 'pvs', 'storageclasses',
  'roles', 'clusterroles', 'rolebindings', 'clusterrolebindings',
  'nodes', 'namespaces', 'events', 'crds', 'helmreleases',
]

// Empty payload shown when no cluster is reachable and demo mode is off.
// clusterConnected drives the frontend "not connected" empty state.
function emptyResources(clusterError) {
  const out = { demoMode: false, clusterConnected: false, clusterError }
  for (const k of RESOURCE_KEYS) out[k] = []
  return out
}

async function loadK8s() {
  if (k8s) return k8s
  k8s = await import('@kubernetes/client-node')
  return k8s
}

async function getClient() {
  if (cachedKc) return cachedKc
  try {
    const lib = await loadK8s()
    const kc = new lib.KubeConfig()
    kc.loadFromDefault()

    const clusters = kc.getClusters()
    if (!clusters?.length) {
      lastError = 'No clusters in kubeconfig'
      return null
    }

    const coreApi = kc.makeApiClient(lib.CoreV1Api)
    await Promise.race([
      coreApi.listNamespace(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 5s')), 5000)),
    ])

    cachedKc = kc
    lastError = null
    console.log(`  ✓ Connected to cluster: ${kc.getCurrentCluster()?.server ?? 'unknown'}`)
    return cachedKc
  } catch (err) {
    lastError = err.message
    cachedKc = null
    return null
  }
}

// Exec into a pod (task 81). Returns a client-node Exec bound to the live cluster, or
// null when no cluster is reachable. The Exec opens its own WebSocket to the apiserver's
// pod/exec subresource; server.js bridges that to the browser terminal.
export async function getExec() {
  const kc = await getClient()
  if (!kc) return null
  const lib = await loadK8s()
  return new lib.Exec(kc)
}

// Add an ephemeral debug container to a running pod, kubectl-debug style (#82). Injects a
// container running `<image>` into the live pod (sharing the target container's process
// namespace when `target` is given), waits until it is Running, and returns its generated
// name. server.js then execs a shell into it via the normal /ws/exec path - so a distroless
// pod with no shell of its own can still be debugged with busybox/netshoot tooling.
// The container is kept alive with a long sleep (portable across busybox/coreutils) so the
// shell we exec in has something to attach to; ephemeral containers cannot be removed, only
// re-added, which matches kubectl debug's own behavior.
export async function addEphemeralDebugContainer(namespace, pod, { image, target } = {}) {
  const kc = await getClient()
  if (!kc) throw new Error('No live cluster connection.')
  const lib = await loadK8s()
  const coreApi = kc.makeApiClient(lib.CoreV1Api)

  const name = `mezz-debug-${Math.random().toString(36).slice(2, 7)}`
  const ec = {
    name,
    image,
    imagePullPolicy: 'IfNotPresent',
    command: ['sleep', '2147483647'],
    stdin: true,
    tty: true,
    terminationMessagePolicy: 'File',
    ...(target ? { targetContainerName: target } : {}),
  }

  // The ephemeralcontainers subresource read returns a Pod; append our container and PUT it
  // back. (kubectl uses a strategic-merge patch; read+replace avoids patch content-type
  // wrangling and is equivalent for an additive change.)
  const cur = await coreApi.readNamespacedPodEphemeralcontainers({ name: pod, namespace })
  cur.spec = cur.spec || {}
  cur.spec.ephemeralContainers = [...(cur.spec.ephemeralContainers || []), ec]
  await coreApi.replaceNamespacedPodEphemeralcontainers({ name: pod, namespace, body: cur })

  // Poll until the container is Running, or surface a pull/start failure instead of hanging.
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    const p = await coreApi.readNamespacedPod({ name: pod, namespace })
    const st = (p.status?.ephemeralContainerStatuses || []).find(c => c.name === name)
    if (st?.state?.running) return { container: name }
    const w = st?.state?.waiting
    if (w?.reason && /Err|BackOff|Invalid|Failed/i.test(w.reason)) {
      throw new Error(`${w.reason}: ${w.message || 'debug container failed to start'}`)
    }
    const t = st?.state?.terminated
    if (t) throw new Error(`Debug container exited (${t.reason || `code ${t.exitCode}`})`)
    await new Promise(r => setTimeout(r, 800))
  }
  throw new Error('Timed out waiting for the debug container to start.')
}

// ── RBAC: policy resolution (task 94) ─────────────────────────────────────────
// k9s-style "what can this resource do". Resolves the *effective rules* of an RBAC
// object: a Role/ClusterRole returns its own rules; a Role/ClusterRoleBinding returns
// its subjects + the bound role's rules; a ServiceAccount aggregates the rules from
// every binding that names it as a subject. This is purely read-only against the
// rbac.authorization.k8s.io objects (no impersonation needed) - exactly how k9s computes
// its policy view. See whoAmI() below for the authoritative `kubectl auth can-i --list`.

// Resolve a roleRef ({kind,name}) to its rules array. `namespace` is used for kind=Role.
async function resolveRoleRules(rbacApi, kind, name, namespace) {
  try {
    if (kind === 'ClusterRole') {
      const cr = await rbacApi.readClusterRole({ name })
      return { rules: cr.rules || [], aggregated: !!cr.aggregationRule }
    }
    const r = await rbacApi.readNamespacedRole({ name, namespace })
    return { rules: r.rules || [] }
  } catch (err) {
    return { rules: [], error: `${kind}/${name}: ${err.body?.message || err.message}` }
  }
}

// Does a binding's subject list reference this ServiceAccount? A subject with no namespace
// inherits the binding's namespace (passed as `bindingNs`).
function bindingNamesSA(subjects, saName, saNs, bindingNs) {
  return (subjects || []).some(sub =>
    sub.kind === 'ServiceAccount' && sub.name === saName &&
    (sub.namespace || bindingNs) === saNs)
}

function formatSubject(sub) {
  if (sub.kind === 'ServiceAccount') return `ServiceAccount/${sub.namespace || ''}/${sub.name}`
  return `${sub.kind}/${sub.name}`
}

export async function fetchPolicy(kind, namespace, name) {
  const kc = await getClient()
  if (!kc) throw new Error('No live cluster connection.')
  const lib = await loadK8s()
  const rbacApi = kc.makeApiClient(lib.RbacAuthorizationV1Api)
  const k = (kind || '').toLowerCase()

  // Role / ClusterRole - its own rules; the single "source" is the role itself.
  if (k === 'role' || k === 'clusterrole') {
    const isCluster = k === 'clusterrole'
    const obj = isCluster
      ? await rbacApi.readClusterRole({ name })
      : await rbacApi.readNamespacedRole({ name, namespace })
    return {
      kind: isCluster ? 'ClusterRole' : 'Role', name, namespace: isCluster ? '' : namespace,
      sources: [{
        source: `${isCluster ? 'ClusterRole' : 'Role'}/${name}`,
        scope: isCluster ? 'cluster-wide' : `namespace: ${namespace}`,
        aggregated: !!obj.aggregationRule,
        rules: obj.rules || [],
      }],
    }
  }

  // RoleBinding / ClusterRoleBinding - subjects + the bound role's rules.
  if (k === 'rolebinding' || k === 'clusterrolebinding') {
    const isCluster = k === 'clusterrolebinding'
    const obj = isCluster
      ? await rbacApi.readClusterRoleBinding({ name })
      : await rbacApi.readNamespacedRoleBinding({ name, namespace })
    const ref = obj.roleRef || {}
    // A ClusterRoleBinding's roleRef is always a ClusterRole; a RoleBinding may reference a
    // ClusterRole (cluster-wide rules applied in the binding's namespace) or a same-namespace Role.
    const resolved = await resolveRoleRules(rbacApi, ref.kind, ref.name, namespace)
    return {
      kind: isCluster ? 'ClusterRoleBinding' : 'RoleBinding', name, namespace: isCluster ? '' : namespace,
      roleRef: ref.kind && ref.name ? `${ref.kind}/${ref.name}` : '',
      subjects: (obj.subjects || []).map(formatSubject),
      sources: [{
        source: ref.kind && ref.name ? `${ref.kind}/${ref.name}` : '(no roleRef)',
        scope: isCluster ? 'cluster-wide' : `namespace: ${namespace}`,
        aggregated: resolved.aggregated, rules: resolved.rules, error: resolved.error,
      }],
    }
  }

  // ServiceAccount - aggregate every Role/ClusterRoleBinding that names it as a subject.
  if (k === 'serviceaccount') {
    const [rbRes, crbRes] = await Promise.all([
      rbacApi.listRoleBindingForAllNamespaces(),
      rbacApi.listClusterRoleBinding(),
    ])
    const sources = []
    for (const rb of rbRes.items) {
      if (!bindingNamesSA(rb.subjects, name, namespace, rb.metadata.namespace)) continue
      const ref = rb.roleRef || {}
      const resolved = await resolveRoleRules(rbacApi, ref.kind, ref.name, rb.metadata.namespace)
      sources.push({
        source: `RoleBinding/${rb.metadata.name} → ${ref.kind}/${ref.name}`,
        scope: `namespace: ${rb.metadata.namespace}`,
        aggregated: resolved.aggregated, rules: resolved.rules, error: resolved.error,
      })
    }
    for (const crb of crbRes.items) {
      if (!bindingNamesSA(crb.subjects, name, namespace, '')) continue
      const ref = crb.roleRef || {}
      const resolved = await resolveRoleRules(rbacApi, ref.kind, ref.name, namespace)
      sources.push({
        source: `ClusterRoleBinding/${crb.metadata.name} → ${ref.kind}/${ref.name}`,
        scope: 'cluster-wide',
        aggregated: resolved.aggregated, rules: resolved.rules, error: resolved.error,
      })
    }
    return { kind: 'ServiceAccount', name, namespace, subject: `system:serviceaccount:${namespace}:${name}`, sources }
  }

  throw new Error(`Unsupported RBAC kind: ${kind}`)
}

// ── RBAC: self access review (task 94) ────────────────────────────────────────
// "What can I (the dashboard's own identity) do?" - the same mechanism `kubectl auth
// can-i --list` uses. SelfSubjectRulesReview returns the effective rules in a namespace;
// SelfSubjectReview returns the identity (k8s >= 1.28, optional - older clusters 404).
export async function whoAmI(namespace = 'default') {
  const kc = await getClient()
  if (!kc) throw new Error('No live cluster connection.')
  const lib = await loadK8s()
  const authzApi = kc.makeApiClient(lib.AuthorizationV1Api)

  const review = await authzApi.createSelfSubjectRulesReview({
    body: { apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectRulesReview', spec: { namespace } },
  })
  const st = review.status || {}

  let user = null, groups = []
  try {
    const authnApi = kc.makeApiClient(lib.AuthenticationV1Api)
    const me = await authnApi.createSelfSubjectReview({
      body: { apiVersion: 'authentication.k8s.io/v1', kind: 'SelfSubjectReview', spec: {} },
    })
    user = me.status?.userInfo?.username || null
    groups = me.status?.userInfo?.groups || []
  } catch { /* SelfSubjectReview unsupported (<1.28); identity stays unknown */ }

  return {
    user, groups, namespace,
    rules: st.resourceRules || [],
    nonResourceRules: st.nonResourceRules || [],
    incomplete: !!st.incomplete,
    evaluationError: st.evaluationError || null,
  }
}

function age(ts) {
  if (!ts) return ''
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

// Derive a kubectl-style pod status (CrashLoopBackOff, ImagePullBackOff, Init:…, etc.)
// rather than the bare phase, so a pod with a bad image surfaces the real reason.
function podStatus(p) {
  if (p.metadata?.deletionTimestamp) return 'Terminating'
  const phase = p.status?.phase || 'Unknown'

  for (const ic of p.status?.initContainerStatuses || []) {
    const t = ic.state?.terminated, w = ic.state?.waiting
    if (t && t.exitCode !== 0) return `Init:${t.reason || `ExitCode:${t.exitCode}`}`
    if (w?.reason && w.reason !== 'PodInitializing') return `Init:${w.reason}`
  }

  let reason = phase
  for (const cs of p.status?.containerStatuses || []) {
    const w = cs.state?.waiting, t = cs.state?.terminated
    if (w?.reason) reason = w.reason
    else if (t?.reason) reason = t.reason
    else if (t && t.exitCode !== 0) reason = `ExitCode:${t.exitCode}`
  }
  return reason || phase
}

// True when a pod is not in a healthy/settled state (used to mark owning workloads degraded).
function podUnhealthy(pod) {
  const ok = pod.status === 'Running' || pod.status === 'Succeeded' || pod.status === 'Completed'
  if (!ok) return true
  const m = /^(\d+)\/(\d+)$/.exec(pod.ready || '')
  return pod.status === 'Running' && m && Number(m[1]) < Number(m[2])
}

// A deployment can report readyReplicas === replicas (old pods still serving) while a new
// rollout pod is stuck (e.g. ImagePullBackOff). Reflect that as Degraded/Progressing.
function deployStatus(d) {
  const spec        = d.spec.replicas ?? 0
  const ready       = d.status.readyReplicas ?? 0
  const available   = d.status.availableReplicas ?? 0
  const updated     = d.status.updatedReplicas ?? 0
  const unavailable = d.status.unavailableReplicas ?? 0
  if (spec === 0) return 'Scaled Down'
  if (ready < spec || available < spec || unavailable > 0) return 'Degraded'
  if (updated < spec) return 'Progressing'
  return 'Available'
}

// Cross-reference pods against their owning workloads: if any owned pod is unhealthy,
// flip an otherwise-"Available" workload to "Degraded". Mutates and returns data.
export function applyWorkloadHealth(data) {
  for (const d of data.deployments || []) {
    if (d.status !== 'Available') continue
    if ((data.pods || []).some(p => p.ownerRef === d.id && podUnhealthy(p))) d.status = 'Degraded'
  }
  const byPrefix = (list) => {
    for (const w of list || []) {
      if (w.status !== 'Available') continue
      const bad = (data.pods || []).some(p =>
        p.namespace === w.namespace && p.name.startsWith(`${w.name}-`) && podUnhealthy(p))
      if (bad) w.status = 'Degraded'
    }
  }
  byPrefix(data.statefulsets)
  byPrefix(data.daemonsets)
  return data
}

function normalizeHelmStatus(s) {
  if (s === 'deployed') return 'Deployed'
  if (s === 'failed') return 'Failed'
  if (s?.startsWith('pending')) return 'Pending'
  if (s === 'superseded') return 'Superseded'
  if (s === 'uninstalling') return 'Terminating'
  return s || 'Unknown'
}

export async function fetchResources() {
  const kc = await getClient()
  if (!kc) {
    if (DEMO) return applyWorkloadHealth({ ...getMockResources(), demoMode: true, clusterError: lastError })
    return emptyResources(lastError)
  }

  try {
    const lib = await loadK8s()
    const coreApi       = kc.makeApiClient(lib.CoreV1Api)
    const appsApi       = kc.makeApiClient(lib.AppsV1Api)
    const batchApi      = kc.makeApiClient(lib.BatchV1Api)
    const networkingApi = kc.makeApiClient(lib.NetworkingV1Api)
    const extApi        = kc.makeApiClient(lib.ApiextensionsV1Api)
    const autoscalingApi = kc.makeApiClient(lib.AutoscalingV2Api)
    const storageApi    = kc.makeApiClient(lib.StorageV1Api)
    const rbacApi       = kc.makeApiClient(lib.RbacAuthorizationV1Api)
    const policyApi     = kc.makeApiClient(lib.PolicyV1Api)

    const settled = await Promise.allSettled([
      coreApi.listPodForAllNamespaces(),
      appsApi.listDeploymentForAllNamespaces(),
      appsApi.listReplicaSetForAllNamespaces(),
      coreApi.listServiceForAllNamespaces(),
      appsApi.listStatefulSetForAllNamespaces(),
      appsApi.listDaemonSetForAllNamespaces(),
      batchApi.listJobForAllNamespaces(),
      batchApi.listCronJobForAllNamespaces(),
      autoscalingApi.listHorizontalPodAutoscalerForAllNamespaces(),
      policyApi.listPodDisruptionBudgetForAllNamespaces(),
      networkingApi.listIngressForAllNamespaces(),
      networkingApi.listNetworkPolicyForAllNamespaces(),
      coreApi.listConfigMapForAllNamespaces(),
      coreApi.listSecretForAllNamespaces(),
      coreApi.listServiceAccountForAllNamespaces(),
      coreApi.listResourceQuotaForAllNamespaces(),
      coreApi.listPersistentVolumeClaimForAllNamespaces(),
      coreApi.listPersistentVolume(),
      storageApi.listStorageClass(),
      rbacApi.listRoleForAllNamespaces(),
      rbacApi.listClusterRole(),
      rbacApi.listRoleBindingForAllNamespaces(),
      rbacApi.listClusterRoleBinding(),
      coreApi.listNode(),
      coreApi.listNamespace(),
      coreApi.listEventForAllNamespaces(),
      extApi.listCustomResourceDefinition(),
    ])

    const ok = r => r.status === 'fulfilled' ? r.value : { items: [] }
    const [
      podsRes, depsRes, rsRes, svcsRes,
      ssRes, dsRes, jobsRes, cjRes,
      hpaRes, pdbRes,
      ingRes, netpolRes,
      cmRes, secRes, saRes, rqRes,
      pvcRes, pvRes, scRes,
      rolesRes, crRolesRes, rbRes, crbRes,
      nodesRes, nsRes, eventsRes,
      crdRes,
    ] = settled.map(ok)

    const pods = podsRes.items.map(p => ({
      id: p.metadata.uid,
      name: p.metadata.name,
      namespace: p.metadata.namespace,
      status: podStatus(p),
      node: p.spec.nodeName || null,
      restarts: p.status.containerStatuses?.reduce((s, c) => s + (c.restartCount ?? 0), 0) ?? 0,
      ready: `${p.status.containerStatuses?.filter(c => c.ready).length ?? 0}/${p.spec.containers.length}`,
      containers: p.spec.containers.map(c => c.name),
      labels: p.metadata.labels || {},
      ip: p.status.podIP || '',
      age: age(p.metadata.creationTimestamp),
      ownerRef: resolveOwnerRef(p, depsRes.items),
      owner: ownerTarget(p.metadata, depsRes.items),
      containerPorts: templatePorts(p.spec.containers),
    }))

    const deployments = depsRes.items.map(d => ({
      id: d.metadata.uid,
      name: d.metadata.name,
      namespace: d.metadata.namespace,
      ready: `${d.status.readyReplicas ?? 0}/${d.spec.replicas ?? 0}`,
      replicas: d.spec.replicas ?? 0,
      readyReplicas: d.status.readyReplicas ?? 0,
      available: d.status.availableReplicas ?? 0,
      upToDate: d.status.updatedReplicas ?? 0,
      unavailable: d.status.unavailableReplicas ?? 0,
      status: deployStatus(d),
      age: age(d.metadata.creationTimestamp),
      selector: d.spec.selector?.matchLabels || {},
      containerPorts: templatePorts(d.spec.template?.spec?.containers),
    }))

    const services = svcsRes.items.map(s => ({
      id: s.metadata.uid,
      name: s.metadata.name,
      namespace: s.metadata.namespace,
      type: s.spec.type,
      clusterIP: s.spec.clusterIP,
      externalIP: s.status?.loadBalancer?.ingress?.[0]?.hostname || s.status?.loadBalancer?.ingress?.[0]?.ip || '',
      ports: s.spec.ports?.map(p => `${p.port}/${p.protocol}`).join(', ') || '',
      age: age(s.metadata.creationTimestamp),
      status: 'Active',
      selector: s.spec.selector || {},
    }))

    const statefulsets = ssRes.items.map(s => ({
      id: s.metadata.uid,
      name: s.metadata.name,
      namespace: s.metadata.namespace,
      ready: `${s.status.readyReplicas ?? 0}/${s.spec.replicas ?? 0}`,
      replicas: s.spec.replicas ?? 0,
      readyReplicas: s.status.readyReplicas ?? 0,
      status: (s.status.readyReplicas ?? 0) >= (s.spec.replicas ?? 1) ? 'Available' : 'Degraded',
      age: age(s.metadata.creationTimestamp),
      containerPorts: templatePorts(s.spec.template?.spec?.containers),
    }))

    const daemonsets = dsRes.items.map(d => ({
      id: d.metadata.uid,
      name: d.metadata.name,
      namespace: d.metadata.namespace,
      desired: d.status.desiredNumberScheduled ?? 0,
      ready: d.status.numberReady ?? 0,
      status: (d.status.numberReady ?? 0) >= (d.status.desiredNumberScheduled ?? 1) ? 'Available' : 'Degraded',
      age: age(d.metadata.creationTimestamp),
    }))

    const jobs = jobsRes.items.map(j => {
      const succeeded = j.status.succeeded ?? 0
      const completions = j.spec.completions ?? 1
      let status = 'Pending'
      if (j.status.completionTime) status = 'Complete'
      else if ((j.status.failed ?? 0) > 0) status = 'Failed'
      else if ((j.status.active ?? 0) > 0) status = 'Running'

      let duration = ''
      if (j.status.startTime) {
        const end = j.status.completionTime ? new Date(j.status.completionTime) : new Date()
        const secs = Math.floor((end - new Date(j.status.startTime)) / 1000)
        duration = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`
      }

      return {
        id: j.metadata.uid,
        name: j.metadata.name,
        namespace: j.metadata.namespace,
        status,
        completions: `${succeeded}/${completions}`,
        duration,
        age: age(j.metadata.creationTimestamp),
        owner: ownerTarget(j.metadata),
      }
    })

    const cronjobs = cjRes.items.map(c => ({
      id: c.metadata.uid,
      name: c.metadata.name,
      namespace: c.metadata.namespace,
      schedule: c.spec.schedule,
      active: c.status.active?.length ?? 0,
      lastSchedule: c.status.lastScheduleTime ? age(c.status.lastScheduleTime) : 'never',
      status: c.spec.suspend ? 'Suspended' : 'Active',
      age: age(c.metadata.creationTimestamp),
    }))

    const ingresses = ingRes.items.map(i => ({
      id: i.metadata.uid,
      name: i.metadata.name,
      namespace: i.metadata.namespace,
      hosts: i.spec.rules?.map(r => r.host || '*').join(', ') || '*',
      address: i.status.loadBalancer?.ingress?.[0]?.hostname || i.status.loadBalancer?.ingress?.[0]?.ip || '',
      ports: i.spec.tls?.length ? '80, 443' : '80',
      status: 'Active',
      age: age(i.metadata.creationTimestamp),
    }))

    const configmaps = cmRes.items.map(c => ({
      id: c.metadata.uid,
      name: c.metadata.name,
      namespace: c.metadata.namespace,
      keys: Object.keys(c.data || {}).length,
      age: age(c.metadata.creationTimestamp),
      status: 'Active',
    }))

    const secrets = secRes.items.map(s => ({
      id: s.metadata.uid,
      name: s.metadata.name,
      namespace: s.metadata.namespace,
      type: s.type,
      keys: Object.keys(s.data || {}).length,
      status: 'Active',
      age: age(s.metadata.creationTimestamp),
    }))

    const pvcs = pvcRes.items.map(p => ({
      id: p.metadata.uid,
      name: p.metadata.name,
      namespace: p.metadata.namespace,
      status: p.status.phase || 'Unknown',
      volume: p.spec.volumeName || '',
      capacity: p.status.capacity?.storage || '',
      age: age(p.metadata.creationTimestamp),
    }))

    const pvs = pvRes.items.map(p => ({
      id: p.metadata.uid,
      name: p.metadata.name,
      namespace: '',
      status: p.status.phase || 'Unknown',
      claim: p.spec.claimRef ? `${p.spec.claimRef.namespace}/${p.spec.claimRef.name}` : '',
      storageClass: p.spec.storageClassName || '',
      capacity: p.spec.capacity?.storage || '',
      age: age(p.metadata.creationTimestamp),
    }))

    const replicasets = rsRes.items.map(r => ({
      id: r.metadata.uid,
      name: r.metadata.name,
      namespace: r.metadata.namespace,
      ready: `${r.status.readyReplicas ?? 0}/${r.spec.replicas ?? 0}`,
      replicas: r.spec.replicas ?? 0,
      readyReplicas: r.status.readyReplicas ?? 0,
      status: (r.status.readyReplicas ?? 0) >= (r.spec.replicas ?? 1) ? 'Available' : 'Degraded',
      age: age(r.metadata.creationTimestamp),
      owner: ownerTarget(r.metadata, depsRes.items),
    }))

    const hpa = hpaRes.items.map(h => ({
      id: h.metadata.uid,
      name: h.metadata.name,
      namespace: h.metadata.namespace,
      targetRef: `${h.spec.scaleTargetRef.kind}/${h.spec.scaleTargetRef.name}`,
      minReplicas: h.spec.minReplicas ?? 1,
      maxReplicas: h.spec.maxReplicas,
      currentReplicas: h.status.currentReplicas ?? 0,
      status: h.status.conditions?.find(c => c.type === 'AbleToScale')?.status === 'True' ? 'Active' : 'Unknown',
      age: age(h.metadata.creationTimestamp),
    }))

    const pdb = pdbRes.items.map(p => ({
      id: p.metadata.uid,
      name: p.metadata.name,
      namespace: p.metadata.namespace,
      minAvailable: p.spec.minAvailable ?? '',
      maxUnavailable: p.spec.maxUnavailable ?? '',
      allowed: p.status.disruptionsAllowed ?? 0,
      status: (p.status.disruptionsAllowed ?? 0) > 0 ? 'Active' : 'Blocking',
      age: age(p.metadata.creationTimestamp),
    }))

    const networkpolicies = netpolRes.items.map(n => ({
      id: n.metadata.uid,
      name: n.metadata.name,
      namespace: n.metadata.namespace,
      ingress: n.spec.ingress?.length ?? 0,
      egress: n.spec.egress?.length ?? 0,
      status: 'Active',
      age: age(n.metadata.creationTimestamp),
    }))

    const serviceaccounts = saRes.items.map(s => ({
      id: s.metadata.uid,
      name: s.metadata.name,
      namespace: s.metadata.namespace,
      secrets: s.secrets?.length ?? 0,
      status: 'Active',
      age: age(s.metadata.creationTimestamp),
    }))

    const resourcequotas = rqRes.items.map(r => {
      const hard = r.status?.hard || {}
      const used = r.status?.used || {}
      return {
        id: r.metadata.uid,
        name: r.metadata.name,
        namespace: r.metadata.namespace,
        cpu: `${used['requests.cpu'] ?? '-'}/${hard['requests.cpu'] ?? '-'}`,
        memory: `${used['requests.memory'] ?? '-'}/${hard['requests.memory'] ?? '-'}`,
        pods: `${used.pods ?? '-'}/${hard.pods ?? '-'}`,
        status: 'Active',
        age: age(r.metadata.creationTimestamp),
      }
    })

    const storageclasses = scRes.items.map(s => ({
      id: s.metadata.uid,
      name: s.metadata.name,
      namespace: '',
      provisioner: s.provisioner,
      reclaim: s.reclaimPolicy || '',
      bindingMode: s.volumeBindingMode || 'Immediate',
      status: 'Active',
      age: age(s.metadata.creationTimestamp),
    }))

    const roles = rolesRes.items.map(r => ({
      id: r.metadata.uid,
      name: r.metadata.name,
      namespace: r.metadata.namespace,
      rules: r.rules?.length ?? 0,
      status: 'Active',
      age: age(r.metadata.creationTimestamp),
    }))

    const clusterroles = crRolesRes.items.map(r => ({
      id: r.metadata.uid,
      name: r.metadata.name,
      namespace: '',
      rules: r.rules?.length ?? 0,
      status: 'Active',
      age: age(r.metadata.creationTimestamp),
    }))

    const rolebindings = rbRes.items.map(r => ({
      id: r.metadata.uid,
      name: r.metadata.name,
      namespace: r.metadata.namespace,
      roleRef: `${r.roleRef.kind}/${r.roleRef.name}`,
      subjects: r.subjects?.length ?? 0,
      status: 'Active',
      age: age(r.metadata.creationTimestamp),
    }))

    const clusterrolebindings = crbRes.items.map(r => ({
      id: r.metadata.uid,
      name: r.metadata.name,
      namespace: '',
      roleRef: `${r.roleRef.kind}/${r.roleRef.name}`,
      subjects: r.subjects?.length ?? 0,
      status: 'Active',
      age: age(r.metadata.creationTimestamp),
    }))

    const events = eventsRes.items
      .sort((a, b) => new Date(b.lastTimestamp || b.eventTime || 0) - new Date(a.lastTimestamp || a.eventTime || 0))
      .slice(0, 500)
      .map(e => ({
        id: e.metadata.uid,
        name: e.metadata.name,
        namespace: e.metadata.namespace,
        type: e.type || 'Normal',
        reason: e.reason || '',
        message: (e.message || '').slice(0, 120),
        object: e.involvedObject ? `${e.involvedObject.kind}/${e.involvedObject.name}` : '',
        count: e.count ?? 1,
        status: e.type === 'Warning' ? 'Warning' : 'Normal',
        age: age(e.lastTimestamp || e.eventTime || e.metadata.creationTimestamp),
      }))

    const nodes = nodesRes.items.map(n => {
      const readyCond = n.status.conditions?.find(c => c.type === 'Ready')
      const status = readyCond?.status === 'True' ? 'Ready' : 'NotReady'
      const roles = Object.keys(n.metadata.labels || {})
        .filter(l => l.startsWith('node-role.kubernetes.io/'))
        .map(l => l.replace('node-role.kubernetes.io/', ''))
        .join(',') || 'worker'
      return {
        id: n.metadata.uid,
        name: n.metadata.name,
        namespace: '',
        status,
        roles,
        version: n.status.nodeInfo?.kubeletVersion || '',
        age: age(n.metadata.creationTimestamp),
      }
    })

    const namespaces = nsRes.items.map(n => ({
      id: n.metadata.uid,
      name: n.metadata.name,
      namespace: '',
      status: n.status.phase || 'Unknown',
      age: age(n.metadata.creationTimestamp),
    }))

    const crds = crdRes.items.map(c => ({
      id: c.metadata.uid,
      name: c.metadata.name,
      namespace: '',
      group: c.spec.group,
      version: c.spec.versions?.[0]?.name || 'v1',
      plural: c.spec.names.plural,
      kind: c.spec.names.kind,
      namespaced: c.spec.scope === 'Namespaced',
      status: 'Active',
      age: age(c.metadata.creationTimestamp),
    }))

    // Parse Helm releases from secrets
    const helmMap = new Map()
    for (const s of secRes.items) {
      const labels = s.metadata.labels || {}
      if (s.type !== 'helm.sh/release.v1' || labels.owner !== 'helm') continue
      const key = `${s.metadata.namespace}/${labels.name}`
      const version = parseInt(labels.version || '0', 10)
      const existing = helmMap.get(key)
      if (!existing || version > existing.version) {
        helmMap.set(key, {
          id: s.metadata.uid,
          name: labels.name || s.metadata.name,
          namespace: s.metadata.namespace,
          chart: labels.chart || '',
          version,
          status: normalizeHelmStatus(labels.status),
          age: age(s.metadata.creationTimestamp),
        })
      }
    }
    const helmreleases = [...helmMap.values()]

    return applyWorkloadHealth({
      pods, deployments, replicasets, services,
      statefulsets, daemonsets, jobs, cronjobs, hpa, pdb,
      ingresses, networkpolicies,
      configmaps, secrets, serviceaccounts, resourcequotas,
      pvcs, pvs, storageclasses,
      roles, clusterroles, rolebindings, clusterrolebindings,
      nodes, namespaces, events, crds, helmreleases,
      demoMode: false, clusterConnected: true, clusterError: null,
    })
  } catch (err) {
    cachedKc = null
    lastError = err.message
    if (DEMO) {
      console.warn('k8s fetch failed, falling back to demo mode:', err.message)
      return applyWorkloadHealth({ ...getMockResources(), demoMode: true, clusterError: err.message })
    }
    console.warn('k8s fetch failed:', err.message)
    return emptyResources(err.message)
  }
}

export async function fetchCrdInstances(group, version, plural) {
  const kc = await getClient()
  if (!kc) return []
  try {
    const lib = await loadK8s()
    const customApi = kc.makeApiClient(lib.CustomObjectsApi)
    const result = await customApi.listClusterCustomObject({ group, version, plural })
    return (result.items || []).map(r => {
      let status = 'Active'
      if (r.status?.phase) status = r.status.phase
      else if (r.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True') status = 'Ready'
      return {
        id: r.metadata.uid,
        name: r.metadata.name,
        namespace: r.metadata.namespace || '',
        status,
        age: age(r.metadata.creationTimestamp),
      }
    })
  } catch (err) {
    console.warn(`CRD fetch failed (${group}/${version}/${plural}):`, err.message)
    return []
  }
}

function resolveOwnerRef(pod, deployments) {
  const owners = pod.metadata.ownerReferences || []
  const rsOwner = owners.find(o => o.kind === 'ReplicaSet')
  if (!rsOwner) return null

  for (const dep of deployments) {
    if (dep.metadata.namespace !== pod.metadata.namespace) continue
    const prefix = dep.metadata.name + '-'
    if (rsOwner.name.startsWith(prefix)) return dep.metadata.uid
  }
  return null
}

const KIND_TO_RESOURCE = {
  Deployment: 'deployments', ReplicaSet: 'replicasets', StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets', Job: 'jobs', CronJob: 'cronjobs',
}

// Resolve the controller owner of a resource into a { resource, name, namespace } jump
// target (shift+j). A pod/RS owned by a ReplicaSet is linked through to its Deployment.
function ownerTarget(meta, deployments) {
  const owners = meta.ownerReferences || []
  const ctrl = owners.find(o => o.controller) || owners[0]
  if (!ctrl) return null
  if (ctrl.kind === 'ReplicaSet' && deployments) {
    for (const dep of deployments) {
      if (dep.metadata.namespace !== meta.namespace) continue
      if (ctrl.name.startsWith(dep.metadata.name + '-'))
        return { resource: 'deployments', name: dep.metadata.name, namespace: meta.namespace }
    }
  }
  const resource = KIND_TO_RESOURCE[ctrl.kind]
  return resource ? { resource, name: ctrl.name, namespace: meta.namespace || '' } : null
}

// Container ports declared on a pod-template spec, for port-forward suggestions.
function templatePorts(containers) {
  return [...new Set((containers || []).flatMap(c => (c.ports || []).map(p => p.containerPort)).filter(Boolean))]
}
