import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { exec, spawn } from 'child_process'
import { PassThrough, Writable } from 'stream'
import { promisify } from 'util'
import cors from 'cors'
import yaml from 'js-yaml'
import { fetchResources, fetchCrdInstances, getExec, addEphemeralDebugContainer, fetchPolicy, whoAmI } from './k8s.js'
import { getMockLogs, getMockDescribe, getMockYaml, getMockCrdResources, getMockHelmValues, getMockHelmAllValues, getMockHelmManifest, getMockHelmHistory, getMockHelmNotes, getMockPolicy, getMockWhoAmI } from './mock.js'

const execAsync = promisify(exec)

// kubectl/helm are invoked as subprocesses (describe/yaml/json/edit/delete/port-forward
// and helm get/history/rollback). Resolve from env so the container can point at its
// bundled binaries on PATH; falls back to a bare name (PATH lookup). In devbox dev,
// start.sh exports MEZZ_KUBECTL/MEZZ_HELM to the nix profile paths.
const KUBECTL = process.env.MEZZ_KUBECTL || 'kubectl'
const HELM    = process.env.MEZZ_HELM    || 'helm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'client', 'dist')

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend if it exists (single-port production mode)
if (existsSync(distDir)) {
  app.use(express.static(distDir))
}

const server = createServer(app)
// Accept WS on any path so Vite's /ws proxy works
const wss = new WebSocketServer({ server })

const clients = new Set()
let latest = {
  pods: [], deployments: [], replicasets: [], services: [],
  statefulsets: [], daemonsets: [], jobs: [], cronjobs: [], hpa: [], pdb: [],
  ingresses: [], networkpolicies: [],
  configmaps: [], secrets: [], serviceaccounts: [], resourcequotas: [],
  pvcs: [], pvs: [], storageclasses: [],
  roles: [], clusterroles: [], rolebindings: [], clusterrolebindings: [],
  nodes: [], namespaces: [], events: [], crds: [], helmreleases: [],
  portforwards: [],
  demoMode: false, clusterConnected: false, clusterError: null,
}

let refreshing = false
async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    const data = await Promise.race([
      fetchResources(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout after 15s')), 15000)),
    ])
    latest = data
    latest.portforwards = pfList()   // surface live forwards in the data stream (#53)
    const msg = JSON.stringify({ type: 'update', data: latest })
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(msg)
    }
  } catch (err) {
    console.error('refresh error:', err.message)
  } finally {
    refreshing = false
  }
}

wss.on('connection', (ws, req) => {
  // /ws/exec is an interactive pod shell session (task 81), not a data-stream subscriber.
  if ((req.url || '').startsWith('/ws/exec')) { handleExec(ws, req); return }
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'update', data: { ...latest, portforwards: pfList() } }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

// Bridge a browser terminal <-> `kubectl exec`-style pod shell over the apiserver.
// Wire protocol (binary vs text disambiguates the two channels in BOTH directions):
//   browser -> server : binary frame = raw stdin keystrokes; text frame = JSON control
//                       ({type:'resize',cols,rows})
//   server -> browser : binary frame = raw stdout/stderr bytes; text frame = JSON status
//                       ({type:'ready'|'error'|'exit', ...})
async function handleExec(ws, req) {
  const url = new URL(req.url, 'http://localhost')
  const namespace = url.searchParams.get('namespace') || 'default'
  const pod       = url.searchParams.get('pod')
  const container = url.searchParams.get('container') || undefined
  const shell     = url.searchParams.get('shell') || '/bin/sh'
  const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) }

  if (latest.demoMode) { send({ type: 'error', message: 'Exec is not available in demo mode.' }); ws.close(); return }
  if (!pod)            { send({ type: 'error', message: 'Missing pod.' }); ws.close(); return }

  let exec
  try { exec = await getExec() } catch (e) { send({ type: 'error', message: e.message }); ws.close(); return }
  if (!exec) { send({ type: 'error', message: 'No live cluster connection.' }); ws.close(); return }

  // stdin: browser keystrokes flow in here -> apiserver.
  const stdin = new PassThrough()
  // stdout/stderr -> browser. The stream carries rows/columns + emits 'resize' so
  // client-node's isResizable() detection enables terminal resize over its channel 4.
  const mkOut = () => new Writable({ write(chunk, _enc, cb) { if (ws.readyState === 1) ws.send(chunk); cb() } })
  const stdout = mkOut()
  const stderr = mkOut()
  stdout.columns = Number(url.searchParams.get('cols')) || 80
  stdout.rows    = Number(url.searchParams.get('rows')) || 24

  let conn = null, closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    try { stdin.end() } catch { /* noop */ }
    try { conn?.close() } catch { /* noop */ }
    if (ws.readyState === 1) ws.close()
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) { stdin.write(data); return }
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        stdout.columns = msg.cols; stdout.rows = msg.rows; stdout.emit('resize')
      }
    } catch { /* ignore malformed control frame */ }
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)

  // `kubectl exec -it` exports TERM from the client; client-node's Exec does not, so the shell
  // would start with an empty TERM. busybox vi tolerates that, but full curses apps (vim, less,
  // top) can't load termcap and hang waiting for input they can't decode - which looked like the
  // terminal "freezing". Re-exec the shell with a sane TERM (done via the shell itself so we
  // don't depend on env(1) existing). $0 is the shell path passed as the trailing arg.
  const cmd = [shell, '-c', 'export TERM=xterm-256color; exec "$0"', shell]

  try {
    conn = await exec.exec(namespace, pod, container, cmd, stdout, stderr, stdin, true, (status) => {
      send({ type: 'exit', status: status.status, message: status.message })
      cleanup()
    })
    conn.on('close', cleanup)
    conn.on('error', (err) => { send({ type: 'error', message: err.message }); cleanup() })
    send({ type: 'ready' })
  } catch (err) {
    send({ type: 'error', message: err.message })
    cleanup()
  }
}

// Shells probed (best-first) so the UI offers only the ones that actually exist in the
// container (#81). Each is run as `<shell> -c 'exit 0'`: the apiserver execs the binary
// directly (no pre-existing shell needed), and a missing binary comes back as a Failure
// status - so this works on distroless/scratch images too (they simply return none).
const SHELL_CANDIDATES = ['/bin/bash', '/bin/zsh', '/bin/ash', '/bin/sh', '/bin/dash', '/busybox/sh']

function probeShell(exec, namespace, pod, container, shell) {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const sink = new Writable({ write(_c, _e, cb) { cb() } })
    exec.exec(namespace, pod, container, [shell, '-c', 'exit 0'], sink, sink, null, false,
      (status) => done(status.status === 'Success'))
      .then((conn) => {
        conn.on('error', () => done(false))
        setTimeout(() => { try { conn.close() } catch { /* noop */ } done(false) }, 5000)
      })
      .catch(() => done(false))
  })
}

// GET /api/exec/shells/:namespace/:pod?container= -> { shells: [...], demo?, error? }
app.get('/api/exec/shells/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const container = req.query.container || undefined
  if (latest.demoMode) return res.json({ shells: [], demo: true })
  let exec
  try { exec = await getExec() } catch { exec = null }
  if (!exec) return res.json({ shells: [], error: 'No live cluster connection.' })
  try {
    const results = await Promise.all(SHELL_CANDIDATES.map(sh =>
      probeShell(exec, namespace, pod, container, sh).then(ok => ok ? sh : null)))
    res.json({ shells: results.filter(Boolean) })
  } catch (err) {
    res.json({ shells: [], error: err.message })
  }
})

// POST /api/debug/:namespace/:pod {image, target?} -> { container } | { error }  (#82)
// Injects an ephemeral debug container; the frontend then execs a shell into the returned
// container name via the normal /ws/exec flow.
app.post('/api/debug/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const { image, target } = req.body || {}
  if (latest.demoMode) return res.status(400).json({ error: 'Debug is not available in demo mode.' })
  if (!image) return res.status(400).json({ error: 'Missing debug image.' })
  try {
    const out = await addEphemeralDebugContainer(namespace, pod, { image, target })
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_, res) => res.json({ ok: true, demoMode: latest.demoMode }))
app.get('/api/data', (_, res) => res.json({ ...latest, portforwards: pfList() }))
app.get('/api/logs/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const { container, tail, sinceSeconds } = req.query
  const tailLines = tail && tail !== 'all' ? parseInt(tail) : undefined
  if (latest.demoMode) {
    return res.json({ logs: getMockLogs(namespace, pod) })
  }
  try {
    const k8s = await import('@kubernetes/client-node')
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const baseParams = {
      name: pod, namespace,
      ...(tailLines !== undefined && { tailLines }),
      ...(sinceSeconds && { sinceSeconds: parseInt(sinceSeconds) }),
    }
    if (container) {
      const result = await coreApi.readNamespacedPodLog({ ...baseParams, container })
      return res.json({ logs: typeof result === 'string' ? result : String(result) })
    }
    // No container = "all containers". The k8s API rejects a container-less log
    // request on a multi-container pod (400), so fetch each container and combine.
    const podInfo = await coreApi.readNamespacedPod({ name: pod, namespace })
    const containers = (podInfo.spec?.containers || []).map(c => c.name)
    if (containers.length <= 1) {
      const result = await coreApi.readNamespacedPodLog(baseParams)
      return res.json({ logs: typeof result === 'string' ? result : String(result) })
    }
    const parts = await Promise.all(containers.map(async c => {
      try {
        const r = await coreApi.readNamespacedPodLog({ ...baseParams, container: c })
        const text = (typeof r === 'string' ? r : String(r)).trim()
        return text ? text.split('\n').map(l => `[${c}] ${l}`).join('\n') : `[${c}] (no logs)`
      } catch (e) {
        return `[${c}] Error: ${e.message}`
      }
    }))
    res.json({ logs: parts.join('\n') })
  } catch (err) {
    res.json({ logs: `Error fetching logs: ${err.message}` })
  }
})

// Multi-pod logs for workloads (deployments, statefulsets, daemonsets, services, jobs)
app.get('/api/logs-multi/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  const { tail, sinceSeconds } = req.query
  const tailLines = tail && tail !== 'all' ? parseInt(tail) : undefined

  let pods = []
  if (resource === 'deployments') {
    const dep = latest.deployments.find(d => d.name === name && d.namespace === namespace)
    if (dep) pods = latest.pods.filter(p => p.ownerRef === dep.id)
  } else if (resource === 'statefulsets' || resource === 'daemonsets') {
    pods = latest.pods.filter(p => p.namespace === namespace && p.name.startsWith(`${name}-`))
  } else if (resource === 'services') {
    const svc = latest.services.find(s => s.name === name && s.namespace === namespace)
    if (svc?.selector && Object.keys(svc.selector).length) {
      pods = latest.pods.filter(p =>
        p.namespace === namespace &&
        Object.entries(svc.selector).every(([k, v]) => p.labels?.[k] === v)
      )
    }
  } else if (resource === 'jobs') {
    pods = latest.pods.filter(p => p.namespace === namespace && p.name.startsWith(`${name}-`))
  }

  if (latest.demoMode || !pods.length) {
    const mockLog = getMockLogs(namespace, name)
    const podNames = pods.length ? pods.map(p => p.name) : [`${name}-demo-abc12`]
    const combined = podNames.map(pn =>
      mockLog.split('\n').map(l => `[${pn}] ${l}`).join('\n')
    ).join('\n')
    return res.json({ logs: combined, podCount: podNames.length, pods: podNames })
  }

  try {
    const k8s = await import('@kubernetes/client-node')
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const results = await Promise.allSettled(pods.map(async pod => {
      const params = {
        name: pod.name, namespace,
        ...(tailLines !== undefined && { tailLines }),
        ...(sinceSeconds && { sinceSeconds: parseInt(sinceSeconds) }),
      }
      const log = await coreApi.readNamespacedPodLog(params)
      return { pod: pod.name, log: typeof log === 'string' ? log : String(log) }
    }))

    const combined = results
      .filter(r => r.status === 'fulfilled')
      .map(({ value: { pod, log } }) =>
        log.trim() ? log.trim().split('\n').map(l => `[${pod}] ${l}`).join('\n') : `[${pod}] (no logs)`
      ).join('\n')

    res.json({ logs: combined, podCount: pods.length, pods: pods.map(p => p.name) })
  } catch (err) {
    res.json({ logs: `Error: ${err.message}`, podCount: 0, pods: [] })
  }
})

// Describe resource via kubectl
app.get('/api/describe/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockDescribe(resource, name, namespace) })
  }
  try {
    const nsFlag = namespace !== '_' ? `-n ${namespace}` : ''
    const { stdout } = await execAsync(
      `${KUBECTL} describe ${resource}/${name} ${nsFlag}`,
      { timeout: 15000 }
    )
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockDescribe(resource, name, namespace), error: err.message })
  }
})

// Get resource YAML via kubectl
app.get('/api/yaml/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockYaml(resource, name, namespace) })
  }
  try {
    const nsFlag = namespace !== '_' ? `-n ${namespace}` : ''
    const { stdout } = await execAsync(
      `${KUBECTL} get ${resource}/${name} ${nsFlag} -o yaml`,
      { timeout: 15000 }
    )
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockYaml(resource, name, namespace), error: err.message })
  }
})

// Get resource JSON via kubectl
app.get('/api/json/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    // Demo mode has no kubectl - derive JSON from the same mock YAML so the JSON
    // view mirrors the YAML view instead of returning an empty {}.
    try {
      const obj = yaml.load(getMockYaml(resource, name, namespace)) || {}
      return res.json({ output: JSON.stringify(obj, null, 2) })
    } catch (err) {
      return res.json({ output: '{}', error: err.message })
    }
  }
  try {
    const nsFlag = namespace !== '_' ? `-n ${namespace}` : ''
    const { stdout } = await execAsync(
      `${KUBECTL} get ${resource}/${name} ${nsFlag} -o json`,
      { timeout: 15000 }
    )
    res.json({ output: JSON.stringify(JSON.parse(stdout), null, 2) })
  } catch (err) {
    res.json({ output: '', error: err.message })
  }
})

// Apply edited YAML via kubectl apply
app.post('/api/edit', express.text({ type: 'text/plain', limit: '2mb' }), async (req, res) => {
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Edit not available in demo mode' })
  }
  if (!req.body?.trim()) {
    return res.status(400).json({ ok: false, error: 'No YAML content provided' })
  }
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(KUBECTL, ['apply', '-f', '-'])
      let out = '', err = ''
      child.stdout.on('data', d => out += d)
      child.stderr.on('data', d => err += d)
      child.on('close', code => {
        if (code === 0) resolve(out.trim())
        else reject(new Error((err || out || `exit code ${code}`).trim()))
      })
      child.on('error', reject)
      child.stdin.write(req.body)
      child.stdin.end()
    })
    res.json({ ok: true, output: result })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Delete resource via kubectl
app.delete('/api/delete/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Delete not available in demo mode' })
  }
  try {
    const nsFlag = namespace !== '_' ? `-n ${namespace}` : ''
    const { stdout, stderr } = await execAsync(
      `${KUBECTL} delete ${resource}/${name} ${nsFlag} --wait=false`,
      { timeout: 15000 }
    )
    res.json({ ok: true, output: (stdout || stderr).trim() })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Helm endpoints
app.get('/api/helm/values/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  const all = req.query.all === 'true'
  const revision = req.query.revision ? parseInt(req.query.revision, 10) : null
  if (latest.demoMode) {
    return res.json({ output: all ? getMockHelmAllValues(name) : getMockHelmValues(name) })
  }
  try {
    const flag = all ? '-a' : ''
    const rev = Number.isInteger(revision) ? `--revision ${revision}` : ''
    const { stdout } = await execAsync(`${HELM} get values ${name} -n ${namespace} ${flag} ${rev}`, { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: all ? getMockHelmAllValues(name) : getMockHelmValues(name), error: err.message })
  }
})

app.get('/api/helm/manifest/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockHelmManifest(name, namespace) })
  }
  try {
    const { stdout } = await execAsync(`${HELM} get manifest ${name} -n ${namespace}`, { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockHelmManifest(name, namespace), error: err.message })
  }
})

app.get('/api/helm/notes/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockHelmNotes(name) })
  }
  try {
    const { stdout } = await execAsync(`${HELM} get notes ${name} -n ${namespace}`, { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockHelmNotes(name), error: err.message })
  }
})

app.get('/api/helm/history/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ history: getMockHelmHistory(name) })
  }
  try {
    const { stdout } = await execAsync(`${HELM} history ${name} -n ${namespace} -o json`, { timeout: 15000 })
    const rows = JSON.parse(stdout).map(r => ({
      revision: r.revision,
      updated: r.updated,
      status: r.status,
      chart: r.chart,
      appVersion: r.app_version,
      description: r.description,
    }))
    res.json({ history: rows })
  } catch (err) {
    res.json({ history: getMockHelmHistory(name), error: err.message })
  }
})

app.post('/api/helm/rollback/:namespace/:name/:revision', async (req, res) => {
  const { namespace, name, revision } = req.params
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Rollback not available in demo mode' })
  }
  try {
    const { stdout, stderr } = await execAsync(
      `${HELM} rollback ${name} ${revision} -n ${namespace}`,
      { timeout: 60000 }
    )
    res.json({ ok: true, output: (stdout || stderr).trim() })
    setTimeout(refresh, 2000)
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// ── Port forwarding ─────────────────────────────────────────────────────────
// Tracks `kubectl port-forward` child processes started from the UI.
const portForwards = new Map() // id → { id, resource, namespace, name, localPort, remotePort, status, error, proc }
let pfSeq = 0
// Strip the child handle and normalize cluster-scoped namespaces ('_' → '') for the UI.
const pfPublic = ({ proc, namespace, ...rest }) => ({ ...rest, namespace: namespace === '_' ? '' : namespace })
const pfList = () => [...portForwards.values()].map(pfPublic)

app.get('/api/port-forward', (_, res) => {
  res.json({ forwards: pfList() })
})

app.post('/api/port-forward/:resource/:namespace/:name', (req, res) => {
  const { resource, namespace, name } = req.params
  const remotePort = parseInt(req.body?.remotePort)
  if (!remotePort) return res.status(400).json({ ok: false, error: 'remotePort is required' })
  const localPort = parseInt(req.body?.localPort) || remotePort
  const id = `pf-${++pfSeq}`

  // Demo mode: simulate an active forward so the UI is exercisable without a cluster.
  if (latest.demoMode) {
    const pf = { id, resource, namespace, name, localPort, remotePort, status: 'active', demo: true, error: null }
    portForwards.set(id, pf)
    return res.json({ ok: true, forward: pfPublic(pf) })
  }

  const nsFlag = namespace !== '_' ? ['-n', namespace] : []
  const args = ['port-forward', `${resource}/${name}`, `${localPort}:${remotePort}`, ...nsFlag, '--address', '127.0.0.1']
  const child = spawn(KUBECTL, args)
  const pf = { id, resource, namespace, name, localPort, remotePort, status: 'starting', error: null, proc: child }
  portForwards.set(id, pf)
  child.stdout.on('data', d => { if (/Forwarding from/.test(String(d))) pf.status = 'active' })
  child.stderr.on('data', d => {
    const msg = String(d)
    if (/Forwarding from/.test(msg)) pf.status = 'active'
    else { pf.error = msg.trim(); if (pf.status !== 'active') pf.status = 'error' }
  })
  child.on('exit', code => { pf.status = 'stopped'; if (code && !pf.error) pf.error = `kubectl exited (${code})` })
  child.on('error', err => { pf.status = 'error'; pf.error = err.message })
  res.json({ ok: true, forward: pfPublic(pf) })
})

app.delete('/api/port-forward/:id', (req, res) => {
  const pf = portForwards.get(req.params.id)
  if (!pf) return res.json({ ok: false, error: 'not found' })
  try { pf.proc?.kill() } catch { /* already gone */ }
  portForwards.delete(req.params.id)
  res.json({ ok: true })
})

// Kill all forwards when the server shuts down so ports are released.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const pf of portForwards.values()) { try { pf.proc?.kill() } catch { /* noop */ } }
    process.exit(0)
  })
}

app.get('/api/crd/:group/:version/:plural', async (req, res) => {
  const { group, version, plural } = req.params
  if (latest.demoMode) {
    return res.json({ items: getMockCrdResources(group, version, plural) })
  }
  const items = await fetchCrdInstances(group, version, plural)
  res.json({ items })
})

// ── RBAC: policy + self access review (task 94) ──────────────────────────────
// Map the frontend resource key to the singular kind fetchPolicy/getMockPolicy expect.
const RBAC_KINDS = {
  roles: 'role', clusterroles: 'clusterrole', rolebindings: 'rolebinding',
  clusterrolebindings: 'clusterrolebinding', serviceaccounts: 'serviceaccount',
}

// Effective policy for an RBAC object (k9s-style "what can this do" view).
app.get('/api/rbac/policy/:kind/:namespace/:name', async (req, res) => {
  const { kind, namespace, name } = req.params
  const k = RBAC_KINDS[kind] || kind
  const ns = namespace === '_' ? '' : namespace
  if (latest.demoMode) return res.json(getMockPolicy(k, name, ns))
  try {
    res.json(await fetchPolicy(k, ns, name))
  } catch (err) {
    res.json({ kind: k, name, namespace: ns, sources: [], error: err.message })
  }
})

// Self access review for the dashboard's own identity (the `kubectl auth can-i --list`
// mechanism). Namespace-scoped, like `auth can-i --list -n <ns>`.
app.get('/api/rbac/can-i', async (req, res) => {
  const namespace = req.query.namespace || 'default'
  if (latest.demoMode) return res.json(getMockWhoAmI(namespace))
  try {
    res.json(await whoAmI(namespace))
  } catch (err) {
    res.json({ user: null, groups: [], namespace, rules: [], nonResourceRules: [], error: err.message })
  }
})

// SPA fallback - serve index.html for any non-API route.
// /ws is the WebSocket endpoint: a real upgrade is handled before Express, but if a
// proxy strips the Upgrade header the request lands here - return 426 instead of HTML
// so it fails cleanly (the client then relies on its HTTP polling fallback).
if (existsSync(distDir)) {
  app.get('*', (req, res) => {
    if (req.path === '/ws') return res.status(426).send('Upgrade Required')
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(distDir, 'index.html'))
    }
  })
}

const PORT = process.env.PORT || 3001
server.listen(PORT, '0.0.0.0', () => {
  const mode = existsSync(distDir) ? 'serving built frontend' : 'API only (run npm run build in client/)'
  console.log(`\n  mezza9 → http://localhost:${PORT}  [${mode}]\n`)
  refresh()
  setInterval(refresh, 5000)
})
