import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync, createReadStream } from 'fs'
import { mkdtemp, rm, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { execFile, spawn } from 'child_process'
import { PassThrough, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { createHash, timingSafeEqual, randomBytes } from 'crypto'
import cors from 'cors'
import yaml from 'js-yaml'
import { fetchResources, fetchCrdInstances, getExec, addEphemeralDebugContainer, fetchPolicy, whoAmI } from './k8s.js'
import { getMockLogs, getMockDescribe, getMockYaml, getMockCrdResources, getMockHelmValues, getMockHelmAllValues, getMockHelmManifest, getMockHelmHistory, getMockHelmNotes, getMockPolicy, getMockWhoAmI } from './mock.js'
import { fetchAwsResources, fetchS3Objects, fetchAwsDescribe, fetchAwsRelated, ec2Action, s3GetObject, s3PutObject, RESOURCE_KEYS as AWS_RESOURCE_KEYS } from './aws.js'

// archiver (7.x) is CommonJS; load it via createRequire since this module is ESM. It streams
// directory/file downloads as tar / tar.gz / zip entirely in-process (task 108), so no host
// tar/zip binary is needed - the production image is node:22-slim.
const require = createRequire(import.meta.url)
const archiver = require('archiver')

// kubectl/helm are run with execFile (NOT exec): execFile invokes the binary directly
// without a shell, so a crafted resource/name/namespace in a URL can never inject shell
// commands. This is the same no-shell pattern the edit/port-forward endpoints use via spawn.
const execFileAsync = promisify(execFile)

// kubectl/helm are invoked as subprocesses (describe/yaml/json/edit/delete/port-forward
// and helm get/history/rollback). Resolve from env so the container can point at its
// bundled binaries on PATH; falls back to a bare name (PATH lookup). In devbox dev,
// start.sh exports MEZZ_KUBECTL/MEZZ_HELM to the nix profile paths.
const KUBECTL = process.env.MEZZ_KUBECTL || 'kubectl'
const HELM    = process.env.MEZZ_HELM    || 'helm'

// Defense in depth on top of the no-shell execFile: reject anything that isn't a plausible
// Kubernetes identifier before it reaches kubectl/helm. Blocks argument injection (a value
// starting with '-' read as a flag) and fails fast with a 400. The charset allows the '.' in
// grouped resource types (foos.example.com) and the ':' in built-in RBAC names
// (system:controller:...); the '_' cluster-scoped namespace sentinel is handled by callers.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const validId = (s) => typeof s === 'string' && s.length > 0 && s.length <= 253 && ID_RE.test(s)
const validTarget = (resource, namespace, name) =>
  validId(resource) && validId(name) && (namespace === '_' || validId(namespace))

// File paths for `kubectl cp` (task 108) are not Kubernetes identifiers - they carry '/', '.',
// spaces, etc. - so validId is too strict. Reject only what breaks the no-shell execFile contract
// or is obviously bogus: empty, control chars (NUL/newline could smuggle a second arg or corrupt
// the stream), or a leading '-' (argument injection - though the in-container path is embedded in
// `<ns>/<pod>:<path>` so it can never be read as a flag). Paths inside the container are the user's
// prerogative; they already have exec.
const validPath = (p) => typeof p === 'string' && p.length > 0 && p.length <= 4096 &&
  ![...p].some(c => c.charCodeAt(0) < 32) && !p.startsWith('-')
// A safe LOCAL filename derived from a user-supplied name: basename only, no directory traversal.
// We control the server temp path, so an uploaded "name" must not escape it.
const safeBase = (n) => {
  const b = String(n || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop()
  return (!b || b === '.' || b === '..') ? 'file' : b
}

// Download archive formats (task 108). 'auto' = stream a single file as-is, archive a directory as
// tar. An explicit tar/tgz/zip archives either a file or a directory in that format - done in
// process via archiver, so no host tar/zip binary is required.
const ARCHIVE_FORMATS = {
  tar: { kind: 'tar', opts: {},                     ext: 'tar', mime: 'application/x-tar' },
  tgz: { kind: 'tar', opts: { gzip: true },         ext: 'tgz', mime: 'application/gzip' },
  zip: { kind: 'zip', opts: { zlib: { level: 9 } }, ext: 'zip', mime: 'application/zip' },
}
// Append the format extension unless the chosen name already carries it ("backup" -> "backup.zip",
// "backup.zip" -> "backup.zip"; tgz also accepts a typed .tar.gz).
function withExt(name, ext) {
  const lower = name.toLowerCase()
  if (lower.endsWith(`.${ext}`)) return name
  if (ext === 'tgz' && lower.endsWith('.tar.gz')) return name
  return `${name}.${ext}`
}
// Content-Disposition value with a filename safe for the quoted-string form (control chars are
// already rejected upstream by validPath / safeBase, so this only neutralizes quotes/backslashes).
const contentDisposition = (name) => `attachment; filename="${name.replace(/["\\\r\n]/g, '_')}"`

// ── Auth gate (task 97) ──────────────────────────────────────────────────────
// Optional shared-token gate. Set MEZZ_TOKEN (or MEZZ_TOKEN_FILE pointing at a file, e.g. a
// mounted Kubernetes Secret) to require that token on every /api/* request AND both WebSocket
// upgrades (/ws data stream + /ws/exec pod shell). Set MEZZ_TOKEN=auto to have the server mint a
// random token and PRINT it (+ a one-click URL) at startup, Jupyter-style, so you don't have to
// invent and track one. When unset the dashboard is UNAUTHENTICATED: anyone who can reach the port
// gets full cluster control (delete / edit / exec / port-forward), so we log a loud warning at
// startup. For real multi-user / per-identity access, front mezza9 with an auth proxy + TLS
// (oauth2-proxy, Istio RequestAuthentication) - the blessed production path documented in
// README.md. This built-in gate is one shared identity, not per-user RBAC.
let AUTH_GENERATED = false   // true when the token was auto-minted this run (MEZZ_TOKEN=auto)
function readToken() {
  const file = process.env.MEZZ_TOKEN_FILE
  if (file != null && file !== '') {
    try { return readFileSync(file, 'utf8').trim() }
    catch (e) { console.error(`  ✗ MEZZ_TOKEN_FILE unreadable (${file}): ${e.message}`); return '' }
  }
  const env = (process.env.MEZZ_TOKEN || '').trim()
  // MEZZ_TOKEN=auto: mint a fresh url-safe token for this run and flag it for the startup banner.
  if (env.toLowerCase() === 'auto') {
    AUTH_GENERATED = true
    return randomBytes(24).toString('base64url')   // 24 bytes -> 32-char url-safe string
  }
  return env
}
// True when the operator explicitly asked for the gate (either env var is present), regardless of
// whether the value turns out usable. Drives the fail-closed check below.
const AUTH_CONFIGURED = process.env.MEZZ_TOKEN_FILE != null || process.env.MEZZ_TOKEN != null
const AUTH_TOKEN = readToken()
const AUTH_ENABLED = AUTH_TOKEN.length > 0

// Fail CLOSED: if a token was configured (MEZZ_TOKEN / MEZZ_TOKEN_FILE set) but resolved EMPTY -
// an unreadable mounted Secret, the wrong Secret key, or a blank/whitespace value - refuse to
// start. The dangerous alternative is silently serving an unauthenticated, cluster-admin dashboard
// while every signal says auth is on. A loud crash-loop is the safe, visible failure; to run
// without the gate, unset the variable entirely rather than setting it empty.
if (AUTH_CONFIGURED && !AUTH_ENABLED) {
  console.error(
    '\n  ✗ auth: a token was configured (MEZZ_TOKEN / MEZZ_TOKEN_FILE) but resolved EMPTY.\n' +
    '    Refusing to start unauthenticated. Check the value, the mounted Secret, and that its key\n' +
    '    matches what is referenced. To run with NO gate, unset the variable entirely.\n'
  )
  process.exit(1)
}
// Pre-hash the expected token once. Comparing fixed-length SHA-256 digests keeps the check
// constant-time (timingSafeEqual) and leaks neither the token's length nor its content.
const EXPECTED_HASH = AUTH_ENABLED ? createHash('sha256').update(AUTH_TOKEN).digest() : null

function tokenOk(provided) {
  if (!AUTH_ENABLED) return true
  if (typeof provided !== 'string' || provided.length === 0) return false
  return timingSafeEqual(EXPECTED_HASH, createHash('sha256').update(provided).digest())
}

// Pull a token from an HTTP request or a WS upgrade request. Order: Authorization: Bearer <t>,
// HTTP Basic (token in the password field, e.g. `curl -u any:token`; falls back to the username
// field so `curl -u token:` also works), then a ?token= query param (browsers cannot set headers
// on a WebSocket, so the WS client passes the token in the URL).
function tokenFromReq(req) {
  const auth = req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  if (auth.startsWith('Basic ')) {
    try {
      const dec = Buffer.from(auth.slice(6), 'base64').toString('utf8')
      const i = dec.indexOf(':')
      if (i < 0) return dec                          // no colon: the whole value is the token
      return dec.slice(i + 1) || dec.slice(0, i)     // password, or username when password is empty
    } catch { /* malformed - fall through to query param */ }
  }
  try { return new URL(req.url, 'http://localhost').searchParams.get('token') } catch { return null }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'client', 'dist')

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend if it exists (single-port production mode). Static assets + the SPA
// shell stay OPEN so the login screen can load; the data endpoints behind them are gated below.
if (existsSync(distDir)) {
  app.use(express.static(distDir))
}

// Gate every /api/* request (task 97). /api/health stays public so liveness/readiness probes
// and the client's "is auth required?" boot probe work without a token. Non-/api paths (the
// SPA + its assets) are served openly above. No-op when AUTH_ENABLED is false.
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next()
  // Normalize exactly how Express routes (case-insensitive, percent-decoded) before deciding what
  // to gate - otherwise /API/data or /%61pi/data would skip a case/encoding-sensitive prefix check
  // yet still match the /api/data route handler, bypassing auth entirely.
  let p = req.path
  try { p = decodeURIComponent(p) } catch { /* malformed escape - gate the raw path */ }
  p = p.toLowerCase()
  if (!p.startsWith('/api/')) return next()
  if (p === '/api/health') return next()
  if (tokenOk(tokenFromReq(req))) return next()
  res.set('WWW-Authenticate', 'Bearer realm="mezza9", Basic realm="mezza9"')
  return res.status(401).json({ error: 'Unauthorized', authRequired: true })
})

const server = createServer(app)
// Accept WS on any path so Vite's /ws proxy works. verifyClient runs during the handshake so an
// unauthenticated upgrade is rejected with 401 BEFORE the socket opens (task 97) - this covers
// both the /ws data stream and the /ws/exec pod shell.
const wss = new WebSocketServer({
  server,
  verifyClient: (info, done) => {
    if (!AUTH_ENABLED) return done(true)
    if (tokenOk(tokenFromReq(info.req))) return done(true)
    return done(false, 401, 'Unauthorized')
  },
})

// Which provider this mezza9 deployment serves (module #2). Chosen at DEPLOY time, not toggled in
// the UI - a given deployment IS a k8s dashboard OR an AWS dashboard. refresh() polls only this
// provider; the client reads it from /api/health to render the right shell. (See modules.md.)
const PROVIDER = (process.env.MEZZ_PROVIDER || 'k8s').toLowerCase() === 'aws' ? 'aws' : 'k8s'
// AWS slice keys carried across refreshes so the payload shape stays stable regardless of provider.
// Resource keys come from the aws module's registry (auto-scales as services are added) + the meta.
const AWS_KEYS = [...AWS_RESOURCE_KEYS, 'awsConnected', 'awsDemo', 'awsRegion', 'awsIdentity', 'awsError']

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
  // AWS provider (module #2). This deployment's provider is fixed at deploy time (MEZZ_PROVIDER);
  // refresh() populates only the active provider's slice. AWS connection/health state is SEPARATE
  // from the k8s flags above (a provider has its own demo/connection state) - flagged in modules.md.
  // AWS resource arrays are seeded just below from the registry so this stays in sync automatically.
  awsConnected: false, awsDemo: false, awsRegion: null, awsIdentity: null, awsError: null,
  provider: PROVIDER,
}
for (const k of AWS_RESOURCE_KEYS) latest[k] = []

let refreshing = false
async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    let data
    if (PROVIDER === 'aws') {
      // AWS deployment: poll AWS only, never touch k8s (k8s keys stay empty). Start from `latest`
      // so the empty k8s slice + prior AWS data are retained, then refresh the AWS slice in its own
      // timeout race. Keep last-good AWS data if the fetch fails so the tables don't blank.
      data = { ...latest }
      const prevAws = {}; for (const k of AWS_KEYS) prevAws[k] = latest[k]
      try {
        Object.assign(data, await Promise.race([
          fetchAwsResources(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('aws fetch timeout after 15s')), 15000)),
        ]))
      } catch (err) {
        Object.assign(data, prevAws)
        console.warn('aws refresh skipped:', err.message)
      }
    } else {
      // k8s deployment (default): poll k8s only, never touch AWS. Carry the (empty) AWS keys forward
      // so the payload shape is stable for the client regardless of provider.
      data = await Promise.race([
        fetchResources(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout after 15s')), 15000)),
      ])
      for (const k of AWS_KEYS) data[k] = latest[k]
    }
    data.provider = PROVIDER
    data.portforwards = pfList()   // surface live forwards in the data stream (#53)
    latest = data                  // single atomic publish
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

// ── File copy: kubectl cp to/from a container (task 108) ─────────────────────
// k9s/kubectl-style file transfer. The "local" side is the BROWSER (not the server filesystem):
// download streams a container file to the user's browser; upload pushes a browser-picked file in.
// Both lean on the real `kubectl cp` (execFile, no shell) so we inherit its battle-tested tar
// plumbing (it execs `tar` inside the container, so the target image must have tar). The server
// only stages bytes in a per-request temp dir, always cleaned up. Live cluster only.

// GET /api/cp/:namespace/:pod/:container?path=<remotePath>&name=<downloadName>&format=<auto|tar|tgz|zip>
// Copies <remotePath> out of the container into a temp dir, then streams it to the browser.
//   format=auto (default): a single file streams as-is; a directory is archived as tar.
//   format=tar|tgz|zip:    a file OR directory is archived in that format (in-process via archiver).
// name overrides the download filename (the format extension is appended for archives).
app.get('/api/cp/:namespace/:pod/:container', async (req, res) => {
  const { namespace, pod, container } = req.params
  const remotePath = req.query.path
  const format = String(req.query.format || 'auto').toLowerCase()
  if (latest.demoMode) return res.status(400).json({ error: 'Copy is not available in demo mode.' })
  if (!validId(namespace) || !validId(pod) || !validId(container)) {
    return res.status(400).json({ error: 'Invalid namespace, pod, or container' })
  }
  if (!validPath(remotePath)) return res.status(400).json({ error: 'Invalid or missing path' })
  if (format !== 'auto' && !ARCHIVE_FORMATS[format]) {
    return res.status(400).json({ error: `Unsupported format: ${format}` })
  }

  const base = safeBase(remotePath)
  // The download filename: the user-supplied name (sanitized to a basename) or the path's basename.
  const downloadBase = String(req.query.name || '').trim() ? safeBase(req.query.name) : base
  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 'mezz-cp-'))
    const dest = join(tmp, base)
    // kubectl cp <ns>/<pod>:<path> <dest> -c <container>. --retries rides out transient stream
    // resets on large copies. maxBuffer is for kubectl's own stdout chatter, not the file (kubectl
    // writes the file to <dest> directly), so a small cap is plenty.
    await execFileAsync(
      KUBECTL, ['cp', `${namespace}/${pod}:${remotePath}`, dest, '-c', container, '--retries=3'],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    )
    // kubectl cp exits 0 even when the in-container path does not exist (the internal `tar` fails
    // but the exit status is not propagated), so a missing dest = the path was not found. Report
    // that cleanly instead of leaking the server temp path in a raw ENOENT.
    let st
    try { st = await stat(dest) }
    catch { return res.status(404).json({ error: `Path not found in container: ${remotePath}` }) }
    res.setHeader('Cache-Control', 'no-store')

    // Single file, no archiving requested: stream the raw bytes with the chosen name. pipeline()
    // destroys the read stream (closing its fd) on success, read error, OR client abort, so neither
    // the descriptor nor the temp dir (cleaned in finally) leaks.
    if (format === 'auto' && !st.isDirectory()) {
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', contentDisposition(downloadBase))
      res.setHeader('Content-Length', String(st.size))
      try { await pipeline(createReadStream(dest), res) }
      catch { /* client aborted or read error - pipeline already destroyed both streams */ }
      return
    }

    // Archive a directory (auto -> tar) or any path in an explicit format. archiver streams the
    // archive; pipeline() resolves/rejects (and tears both sides down) on completion or client abort.
    const spec = format === 'auto' ? ARCHIVE_FORMATS.tar : ARCHIVE_FORMATS[format]
    res.setHeader('Content-Type', spec.mime)
    res.setHeader('Content-Disposition', contentDisposition(withExt(downloadBase, spec.ext)))
    const archive = archiver(spec.kind, spec.opts)
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy() })
    // The copied entry keeps its original basename inside the archive (e.g. zip of "src/" -> src/...).
    if (st.isDirectory()) archive.directory(dest, base)
    else archive.file(dest, { name: base })
    try {
      const piped = pipeline(archive, res)
      archive.finalize()
      await piped
    } catch { /* client aborted or archive error - streams already torn down */ }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message })
  } finally {
    if (tmp) rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

// POST /api/cp/:namespace/:pod/:container?path=<remoteDir>&name=<filename>   (body = raw file bytes)
// Stage the uploaded bytes in a temp file, then `kubectl cp` it to <remoteDir>/<filename> in the
// container. The browser can't tar, so it POSTs raw octet-stream; safeBase() keeps the filename
// from escaping the temp dir.
app.post('/api/cp/:namespace/:pod/:container', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
  const { namespace, pod, container } = req.params
  const destDir = req.query.path
  const name = safeBase(req.query.name)
  if (latest.demoMode) return res.status(400).json({ ok: false, error: 'Copy is not available in demo mode.' })
  if (!validId(namespace) || !validId(pod) || !validId(container)) {
    return res.status(400).json({ ok: false, error: 'Invalid namespace, pod, or container' })
  }
  if (!validPath(destDir)) return res.status(400).json({ ok: false, error: 'Invalid or missing destination path' })
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ ok: false, error: 'No file content' })
  }

  let tmp
  try {
    tmp = await mkdtemp(join(tmpdir(), 'mezz-cp-'))
    const src = join(tmp, name)
    await writeFile(src, req.body)
    const remote = destDir.replace(/\/+$/, '') + '/' + name   // join dir + filename, no shell
    const { stdout, stderr } = await execFileAsync(
      KUBECTL, ['cp', src, `${namespace}/${pod}:${remote}`, '-c', container, '--retries=3'],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 }
    )
    res.json({ ok: true, output: (stdout || stderr || '').trim(), path: remote })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  } finally {
    if (tmp) rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

// Public: probes + the client's "do I need a token?" boot check. Never gated.
app.get('/api/health', (_, res) => res.json({ ok: true, demoMode: latest.demoMode, authRequired: AUTH_ENABLED, provider: PROVIDER }))
// Behind the auth gate: reaching it means the supplied token was accepted (or auth is off).
// The login screen calls this to validate a token before storing it.
app.get('/api/auth/verify', (_, res) => res.json({ ok: true }))
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
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['describe', `${resource}/${name}`, ...nsArgs],
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
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['get', `${resource}/${name}`, ...nsArgs, '-o', 'yaml'],
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
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['get', `${resource}/${name}`, ...nsArgs, '-o', 'json'],
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
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ ok: false, error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout, stderr } = await execFileAsync(
      KUBECTL, ['delete', `${resource}/${name}`, ...nsArgs, '--wait=false'],
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
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const flagArgs = all ? ['-a'] : []
    const revArgs = Number.isInteger(revision) ? ['--revision', String(revision)] : []
    const { stdout } = await execFileAsync(HELM, ['get', 'values', name, '-n', namespace, ...flagArgs, ...revArgs], { timeout: 15000 })
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
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['get', 'manifest', name, '-n', namespace], { timeout: 15000 })
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
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['get', 'notes', name, '-n', namespace], { timeout: 15000 })
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
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ history: [], error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['history', name, '-n', namespace, '-o', 'json'], { timeout: 15000 })
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
  const rev = parseInt(revision, 10)
  if (!validId(name) || !validId(namespace) || !Number.isInteger(rev) || rev < 1) {
    return res.status(400).json({ ok: false, error: 'Invalid release, namespace, or revision' })
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      HELM, ['rollback', name, String(rev), '-n', namespace],
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

// ── AWS provider (module #2) ─────────────────────────────────────────────────
// Addressed by AWS identity (region + bucket/key + instance-id) rather than namespace/name - the
// k8s /:resource/:namespace/:name route shape can't carry `region`, so AWS gets its own routes
// (friction: provider-specific resource addressing). All inherit the /api/* auth gate automatically.
// Reads work in demo; writes refuse in demo (the helpers self-guard), mirroring the k8s posture.

// GET a single resource's full detail for the inspect modal (module #2): { json, tags, describe }.
// The AWS-native analog of /api/describe|yaml|json - READ only (no edit route, AWS resources mutate
// via specific Modify/Put calls). region + id are smuggled in the path since AWS addressing doesn't
// fit /:resource/:namespace/:name. The helper self-tiers live -> mock, so no latest.demoMode check.
app.get('/api/aws/describe/:service/:region/:id', async (req, res) => {
  const { service, region, id } = req.params
  if (!AWS_RESOURCE_KEYS.includes(service)) return res.status(400).json({ error: 'Unknown AWS service' })
  if (!validId(region) || !validId(id)) return res.status(400).json({ error: 'Invalid region or id' })
  res.json(await fetchAwsDescribe(service, region, id))
})

// GET a resource's RELATED resources for the jump view (phase 1): { links:[{resource,id,name,relation}] }.
// The AWS-native analog of jumpToOwner, typed + multi-edge. region + id smuggled in the path like
// describe. Self-tiers live -> mock; the client guards each link on the target existing in its data.
app.get('/api/aws/related/:service/:region/:id', async (req, res) => {
  const { service, region, id } = req.params
  if (!AWS_RESOURCE_KEYS.includes(service)) return res.status(400).json({ error: 'Unknown AWS service' })
  if (!validId(region) || !validId(id)) return res.status(400).json({ error: 'Invalid region or id' })
  res.json(await fetchAwsRelated(service, region, id))
})

// GET objects in a bucket (the lazy Enter-drill target; s3objects is never broadcast in the stream).
app.get('/api/aws/s3/:bucket', async (req, res) => {
  const { bucket } = req.params
  if (!validId(bucket)) return res.status(400).json({ error: 'Invalid bucket' })
  res.json({ objects: await fetchS3Objects(bucket) })
})

// GET one object -> browser download. Key carries '/', so it's a query param like kubectl-cp's ?path=.
app.get('/api/aws/s3/:bucket/object', async (req, res) => {
  const { bucket } = req.params
  const key = req.query.key
  if (!validId(bucket) || !validPath(key)) return res.status(400).json({ error: 'Invalid bucket or key' })
  const obj = await s3GetObject(bucket, key)
  if (!obj) return res.status(404).json({ error: 'Object not found, or AWS unavailable.' })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', obj.contentType || 'application/octet-stream')
  res.setHeader('Content-Disposition', contentDisposition(safeBase(key)))
  if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength))
  if (obj.body && typeof obj.body.pipe === 'function') {       // live: a Node Readable
    try { await pipeline(obj.body, res) } catch { /* client aborted - streams torn down */ }
  } else {                                                     // mock: a Buffer/string
    res.end(Buffer.isBuffer(obj.body) ? obj.body : Buffer.from(String(obj.body ?? '')))
  }
})

// POST one object <- browser upload (raw octet-stream body, like the kubectl-cp upload).
app.post('/api/aws/s3/:bucket/object', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
  const { bucket } = req.params
  const key = req.query.key
  if (!validId(bucket) || !validPath(key)) return res.status(400).json({ ok: false, error: 'Invalid bucket or key' })
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ ok: false, error: 'No file content' })
  const r = await s3PutObject(bucket, key, req.body)
  res.status(r.ok ? 200 : 400).json(r)
})

// POST an EC2 state transition. op in {start,stop,reboot,terminate}; region addresses the instance.
const EC2_OPS = new Set(['start', 'stop', 'reboot', 'terminate'])
app.post('/api/aws/ec2/:region/:id/:op', async (req, res) => {
  const { region, id, op } = req.params
  if (!validId(region) || !validId(id) || !EC2_OPS.has(op)) {
    return res.status(400).json({ ok: false, error: 'Invalid region, instance id, or op' })
  }
  const r = await ec2Action(op, region, id)
  res.status(r.ok ? 200 : 400).json(r)
  if (r.ok) setTimeout(refresh, 2000)   // reflect the new state sooner than the next 5s tick
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
  console.log(`\n  mezza9 → http://localhost:${PORT}  [${mode}]`)
  if (AUTH_GENERATED) {
    // Jupyter-style: surface the freshly minted token + a one-click URL (the SPA reads ?token=
    // from the address bar on load, stores it, then strips it). Note it changes every restart.
    console.log('  ✓ auth: token gate ENABLED (auto-generated this run; changes on restart)')
    console.log(`    token: ${AUTH_TOKEN}`)
    console.log(`    open:  http://localhost:${PORT}/?token=${AUTH_TOKEN}\n`)
  } else if (AUTH_ENABLED) {
    console.log('  ✓ auth: token gate ENABLED (requests need MEZZ_TOKEN)\n')
  } else {
    console.warn(
      '  ⚠ auth: DISABLED - no MEZZ_TOKEN set. Anyone who can reach this port has full cluster\n' +
      '    control (delete / edit / exec / port-forward). Set MEZZ_TOKEN, or front mezza9 with an\n' +
      '    auth proxy + TLS (see README). Keep the bind on loopback until one of those is in place.\n'
    )
  }
  refresh()
  setInterval(refresh, 5000)
})
