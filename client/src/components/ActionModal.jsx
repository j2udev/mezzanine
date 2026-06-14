import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { VimEditor } from './VimEditor'
import { VimHelpOverlay } from './VimHelpOverlay'

const MULTI_LOG_RESOURCES = new Set(['deployments', 'statefulsets', 'daemonsets', 'services', 'jobs'])
const CLUSTER_SCOPED      = new Set(['nodes', 'pvs', 'namespaces', 'crds'])

const TAIL_OPTIONS = [
  { label: '50',   value: '50' },
  { label: '200',  value: '200' },
  { label: '500',  value: '500' },
  { label: '1000', value: '1000' },
  { label: 'All',  value: 'all' },
]
const SINCE_OPTIONS = [
  { label: 'All time', value: '0'     },
  { label: 'Last 15m', value: '900'   },
  { label: 'Last 1h',  value: '3600'  },
  { label: 'Last 6h',  value: '21600' },
  { label: 'Last 24h', value: '86400' },
]

// ── Secret decode helpers ─────────────────────────────────────────────────────

function transformSecretDataSection(yaml, decode) {
  let inData = false
  return yaml.split('\n').map(line => {
    if (/^data:/.test(line))                              { inData = true;  return line }
    if (/^[a-zA-Z]/.test(line) && !/^\s/.test(line))     { inData = false }
    if (inData && /^\s+[^:]+:\s+\S/.test(line)) {
      const m = line.match(/^(\s+[^:]+:\s+)(.+)$/)
      if (m) {
        try {
          const val = decode ? atob(m[2].trim()) : btoa(m[2].trim())
          return `${m[1]}${val}`
        } catch { return line }
      }
    }
    return line
  }).join('\n')
}

// JSON sibling of transformSecretDataSection — transform the string values inside the
// flat `"data": { … }` object in `kubectl get -o json` output, preserving formatting.
function transformSecretJsonData(json, decode) {
  let inData = false
  return json.split('\n').map(line => {
    if (/^\s*"data":\s*\{/.test(line)) { inData = true;  return line }
    if (inData && /^\s*\}/.test(line)) { inData = false; return line }
    if (inData) {
      const m = line.match(/^(\s*"[^"]+":\s*")([^"]*)("?,?)\s*$/)
      if (m) {
        try {
          const val = decode ? atob(m[2]) : btoa(m[2])
          return `${m[1]}${val}${m[3]}`
        } catch { return line }
      }
    }
    return line
  }).join('\n')
}

// ── Renderers ────────────────────────────────────────────────────────────────

function highlight(text, term, isCurrent) {
  if (!term) return <span>{text}</span>
  const parts = []
  const lc = text.toLowerCase()
  const lq = term.toLowerCase()
  let pos = 0
  let hit = lc.indexOf(lq, pos)
  while (hit !== -1) {
    if (hit > pos) parts.push(<span key={pos}>{text.slice(pos, hit)}</span>)
    parts.push(
      <span key={hit} style={{
        background: isCurrent ? 'rgba(255,204,68,0.55)' : 'rgba(255,204,68,0.25)',
        color: isCurrent ? '#fff' : '#ffee88',
        borderRadius: 2,
      }}>
        {text.slice(hit, hit + term.length)}
      </span>
    )
    pos = hit + term.length
    hit = lc.indexOf(lq, pos)
  }
  if (pos < text.length) parts.push(<span key={pos}>{text.slice(pos)}</span>)
  return parts
}

function LogLine({ line, search, isCurrent }) {
  let color = '#a0c8a0'
  if (/\bERROR\b|\bFATAL\b|\bPANIC\b/i.test(line)) color = '#ff6677'
  else if (/\bWARN\b|\bWARNING\b/i.test(line)) color = '#ffcc44'
  else if (/\bDEBUG\b|\bTRACE\b/i.test(line)) color = '#5a8a9a'
  else if (/\bINFO\b/i.test(line)) color = '#88c4a0'
  return (
    <div style={{ color, lineHeight: 1.7, background: isCurrent ? 'rgba(255,204,68,0.08)' : 'transparent' }}>
      {search ? highlight(line || ' ', search, isCurrent) : (line || ' ')}
    </div>
  )
}

function DescribeLine({ line, search, isCurrent }) {
  return (
    <div style={{
      color: '#c0d8f0', lineHeight: 1.7, fontFamily: "'Courier New', monospace", fontSize: 11,
      background: isCurrent ? 'rgba(255,204,68,0.08)' : 'transparent',
      whiteSpace: 'pre-wrap',
    }}>
      {search ? highlight(line, search, isCurrent) : line}
    </div>
  )
}

function YamlLine({ line, search, isCurrent }) {
  const bg = isCurrent ? 'rgba(255,204,68,0.08)' : 'transparent'
  // whiteSpace: pre-wrap preserves YAML/JSON indentation (HTML would otherwise collapse it)
  const base = { lineHeight: 1.7, background: bg, whiteSpace: 'pre-wrap' }
  if (/^\s*#/.test(line)) {
    return <div style={{ ...base, color: '#4a8a5a' }}>
      {search ? highlight(line, search, isCurrent) : line}
    </div>
  }
  const m = line.match(/^(\s*-?\s*)([^:\s][^:]*?):\s*(.*)$/)
  if (m) {
    const [, indent, key, val] = m
    const valColor = val === '' ? '#667788'
      : (val === 'null' || val === '~') ? '#aa77ff'
      : (val === 'true' || val === 'false') ? '#aa77ff'
      : /^-?\d/.test(val) ? '#ffa040'
      : (val.startsWith('"') || val.startsWith("'")) ? '#88d4a0'
      : '#c0d8f0'
    return (
      <div style={base}>
        <span style={{ color: '#667788' }}>{indent}</span>
        <span style={{ color: '#5ac8fa' }}>{search ? highlight(key, search, isCurrent) : key}</span>
        <span style={{ color: '#667788' }}>:</span>
        {val && <span style={{ color: valColor }}>{search ? highlight(` ${val}`, search, isCurrent) : ` ${val}`}</span>}
      </div>
    )
  }
  if (/^\s*-\s/.test(line)) {
    return <div style={{ ...base, color: '#aac8e0' }}>
      {search ? highlight(line, search, isCurrent) : line}
    </div>
  }
  return <div style={{ ...base, color: '#8aabb8' }}>
    {search ? highlight(line, search, isCurrent) : line}
  </div>
}

// Unified renderer for describe / yaml / json / helm text blocks. Renders each line with
// optional line-number gutter, search highlighting, and per-match scroll refs.
function ContentLines({ lines, kind, search, lineToMatchIdx, matchIndex, showLineNumbers, matchRefs, emptyLabel }) {
  const Line = kind === 'describe' ? DescribeLine : YamlLine
  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11 }}>
      {lines.map((line, i) => {
        const mn = lineToMatchIdx[i]
        const isMatch = mn !== undefined
        return (
          <div key={i}
            ref={isMatch ? (el => { if (el) matchRefs.current[mn] = el }) : undefined}
            style={{ display: 'flex' }}>
            {showLineNumbers && (
              <span style={{ width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 10, color: '#2a4a6a', userSelect: 'none', fontSize: 10 }}>
                {i + 1}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <Line line={line} search={search || null} isCurrent={isMatch && mn === matchIndex} />
            </span>
          </div>
        )
      })}
      {lines.length === 0 && <div style={{ color: '#3a6a8a' }}>{emptyLabel || 'No content.'}</div>}
    </div>
  )
}

function ControlSelect({ value, onChange, options, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: '#3a6a8a', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)',
        color: '#7ab8d8', fontSize: 10, padding: '1px 4px', borderRadius: 3,
        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function VimHint({ k, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{
        display: 'inline-block', padding: '0 4px', borderRadius: 2, fontSize: 9,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#5a8aaa', fontFamily: 'inherit',
      }}>{k}</span>
      <span style={{ fontSize: 9, color: '#2a4a6a' }}>{label}</span>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ActionModal() {
  const modal      = useStore(s => s.modal)
  const closeModal = useStore(s => s.closeModal)

  // Content
  const [content,    setContent]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [fetchError, setFetchError] = useState(null)

  // Log controls
  const [logFilter,     setLogFilter]     = useState('')
  const [logTail,       setLogTail]       = useState('200')
  const [logSince,      setLogSince]      = useState('0')
  const [logContainer,  setLogContainer]  = useState('')
  const [logAutoScroll, setLogAutoScroll] = useState(true)
  const [logPods,       setLogPods]       = useState([])
  const [logPodFilter,  setLogPodFilter]  = useState('all')

  // Search (describe/yaml) + match navigation (shared with log filter)
  const [search,       setSearch]       = useState('')  // active search term (describe/yaml)
  const [searchActive, setSearchActive] = useState(false)
  const [matchIndex,   setMatchIndex]   = useState(0)

  // Edit
  const [editContent,    setEditContent]    = useState('')
  const [editSaving,     setEditSaving]     = useState(false)
  const [editResult,     setEditResult]     = useState(null)
  const [editVimMode,    setEditVimMode]    = useState(true)
  // CodeMirror owns the edit buffer & vim engine (#61). We only mirror its current
  // vim sub-mode here so the footer can show NORMAL / INSERT / VISUAL.
  const [vimMode,        setVimMode]        = useState('normal')
  const [vimHelp,        setVimHelp]        = useState(false)  // vim cheatsheet overlay

  // Secret decode
  const [secretDecoded, setSecretDecoded] = useState(false)

  // Helm history
  const [helmHistory,        setHelmHistory]        = useState([])
  const [helmRollbackStatus, setHelmRollbackStatus] = useState({}) // rev → 'rolling' | 'ok' | 'err'
  const [historyValues,      setHistoryValues]      = useState(null) // { revision, content } | null (peek a revision's values)
  const [historyValuesBusy,  setHistoryValuesBusy]  = useState(false)

  // Copy feedback
  const [copyFlash, setCopyFlash] = useState(false)

  // Line numbers
  const [showLineNumbers, setShowLineNumbers] = useState(false)

  // Unified describe/yaml/json/edit mode
  const [editMode,        setEditMode]        = useState(false)  // true = edit textarea, false = read view
  const [viewFormat,      setViewFormat]      = useState('yaml') // 'describe' | 'yaml' | 'json'
  const [jsonContent,     setJsonContent]     = useState('')
  const [describeContent, setDescribeContent] = useState('')

  // Helm values: single view that toggles between user-supplied and computed (all) values
  const [helmAllValues, setHelmAllValues] = useState(false)

  const scrollRef   = useRef()
  const filterRef   = useRef()   // log filter input
  const searchRef   = useRef()   // describe/yaml search input
  const editViewRef = useRef()   // CodeMirror EditorView (edit mode)
  const lastGRef    = useRef(0)
  const matchRefs   = useRef({})
  const fetchedRef  = useRef({})  // `${itemId}|${format}` → true, avoids refetching a loaded view

  const isMulti  = modal && MULTI_LOG_RESOURCES.has(modal.resource)
  const nsParam  = modal ? (CLUSTER_SCOPED.has(modal.resource) ? '_' : (modal.item.namespace || '_')) : '_'
  const isInspect = modal && (modal.type === 'describe' || modal.type === 'yaml' || modal.type === 'edit')

  // ── Derived data ──────────────────────────────────────────────────────────

  const logLines = useMemo(() => content ? content.split('\n') : [], [content])

  // For logs: lines that pass the filter
  const filteredLogLines = useMemo(() => {
    if (!logFilter) return logLines
    const q = logFilter.toLowerCase()
    return logLines.filter(l => l.toLowerCase().includes(q))
  }, [logLines, logFilter])

  // The raw text shown in the current read view (describe/yaml/json) or helm/logs content.
  const rawViewContent = useMemo(() => {
    if (!isInspect) return content
    if (viewFormat === 'json') return jsonContent
    if (viewFormat === 'describe') return describeContent
    return content // yaml
  }, [isInspect, viewFormat, content, jsonContent, describeContent])

  // For describe/yaml: indices of lines that match the search (secret decode applies to yaml only)
  const displayContent   = useMemo(() => {
    if (modal?.resource !== 'secrets' || !secretDecoded || !isInspect) return rawViewContent
    if (viewFormat === 'yaml') return transformSecretDataSection(rawViewContent, true)
    if (viewFormat === 'json') return transformSecretJsonData(rawViewContent, true)
    return rawViewContent
  }, [rawViewContent, secretDecoded, modal?.resource, isInspect, viewFormat])
  const contentLines     = useMemo(() => displayContent ? displayContent.split('\n') : [], [displayContent])
  // Read-view search (describe/yaml/json + logs). Edit-mode search is owned by CodeMirror.
  const searchMatchLineIndices = useMemo(() => {
    const activeSearch = modal?.type === 'logs' ? logFilter : search
    if (!activeSearch) return []
    const q = activeSearch.toLowerCase()
    return contentLines.reduce((acc, line, i) => {
      if (line.toLowerCase().includes(q)) acc.push(i)
      return acc
    }, [])
  }, [contentLines, search, logFilter])

  // For logs, matching lines come from filteredLogLines
  const logMatchCount    = filteredLogLines.length
  const nonLogMatchCount = searchMatchLineIndices.length

  // Map line index → match number for describe/yaml rendering
  const lineToMatchIdx = useMemo(() => {
    const m = {}
    searchMatchLineIndices.forEach((li, mi) => { m[li] = mi })
    return m
  }, [searchMatchLineIndices])

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    if (!modal) return
    setLoading(true); setFetchError(null)
    try {
      let url
      if (isMulti && logPodFilter === 'all') {
        url = `/api/logs-multi/${modal.resource}/${modal.item.namespace}/${modal.item.name}`
          + `?tail=${logTail}${logSince !== '0' ? `&sinceSeconds=${logSince}` : ''}`
      } else {
        const podName = (isMulti && logPodFilter !== 'all') ? logPodFilter : modal.item.name
        url = `/api/logs/${modal.item.namespace}/${podName}`
          + `?tail=${logTail}${logSince !== '0' ? `&sinceSeconds=${logSince}` : ''}${logContainer ? `&container=${logContainer}` : ''}`
      }
      const res  = await fetch(url)
      const data = await res.json()
      setContent(data.logs || '')
      if (data.pods?.length > 0) setLogPods(data.pods)
    } catch (err) { setFetchError(err.message) }
    finally      { setLoading(false) }
  }, [modal, isMulti, logTail, logSince, logContainer, logPodFilter])

  const fetchYaml = useCallback(async () => {
    if (!modal) return
    setLoading(true); setFetchError(null)
    try {
      const res  = await fetch(`/api/yaml/${modal.resource}/${nsParam}/${modal.item.name}`)
      const data = await res.json()
      setContent(data.output || '')
    } catch (err) { setFetchError(err.message) }
    finally      { setLoading(false) }
  }, [modal, nsParam])

  const fetchDescribe = useCallback(async () => {
    if (!modal) return
    setLoading(true); setFetchError(null)
    try {
      const res  = await fetch(`/api/describe/${modal.resource}/${nsParam}/${modal.item.name}`)
      const data = await res.json()
      setDescribeContent(data.output || '')
    } catch (err) { setFetchError(err.message) }
    finally      { setLoading(false) }
  }, [modal, nsParam])

  const fetchJson = useCallback(async () => {
    if (!modal) return
    setLoading(true); setFetchError(null)
    try {
      const url  = `/api/json/${modal.resource}/${nsParam}/${modal.item.name}`
      const res  = await fetch(url)
      const data = await res.json()
      setJsonContent(data.output || '')
    } catch (err) { setFetchError(err.message) }
    finally      { setLoading(false) }
  }, [modal, nsParam])

  const fetchHelmContent = useCallback(async (helmType) => {
    if (!modal) return
    setLoading(true); setFetchError(null); setHelmHistory([])
    try {
      const { namespace, name } = modal.item
      if (helmType === 'helm-history') {
        const res  = await fetch(`/api/helm/history/${namespace}/${name}`)
        const data = await res.json()
        setHelmHistory(data.history || [])
      } else {
        const endpointMap = {
          'helm-values':    `/api/helm/values/${namespace}/${name}${helmAllValues ? '?all=true' : ''}`,
          'helm-manifest':  `/api/helm/manifest/${namespace}/${name}`,
          'helm-notes':     `/api/helm/notes/${namespace}/${name}`,
        }
        const res  = await fetch(endpointMap[helmType])
        const data = await res.json()
        setContent(data.output || '')
      }
    } catch (err) { setFetchError(err.message) }
    finally      { setLoading(false) }
  }, [modal, helmAllValues])

  const fetchRevisionValues = useCallback(async (revision) => {
    if (!modal) return
    const { namespace, name } = modal.item
    setHistoryValues({ revision, content: '' }); setHistoryValuesBusy(true)
    try {
      const res  = await fetch(`/api/helm/values/${namespace}/${name}?revision=${revision}`)
      const data = await res.json()
      setHistoryValues({ revision, content: data.output || '' })
    } catch (err) { setHistoryValues({ revision, content: `Error: ${err.message}` }) }
    finally       { setHistoryValuesBusy(false) }
  }, [modal])

  const doRollback = useCallback(async (revision) => {
    if (!modal) return
    const { namespace, name } = modal.item
    setHelmRollbackStatus(s => ({ ...s, [revision]: 'rolling' }))
    try {
      const res  = await fetch(`/api/helm/rollback/${namespace}/${name}/${revision}`, { method: 'POST' })
      const data = await res.json()
      setHelmRollbackStatus(s => ({ ...s, [revision]: data.ok ? 'ok' : 'err' }))
    } catch {
      setHelmRollbackStatus(s => ({ ...s, [revision]: 'err' }))
    }
  }, [modal])

  // ── Effects ───────────────────────────────────────────────────────────────

  // Reset on modal open. Logs/helm fetch here; inspect formats are fetched lazily below.
  const prevAllValues = useRef(null)
  useEffect(() => {
    if (!modal) return
    setContent(''); setDescribeContent(''); setJsonContent('')
    setFetchError(null); setLogPods([])
    setLogFilter(''); setLogPodFilter('all')
    setSearch(''); setSearchActive(false); setMatchIndex(0)
    setEditResult(null); setVimMode('normal'); setVimHelp(false)
    setSecretDecoded(!!modal.decoded); setHelmHistory([]); setHelmRollbackStatus({})
    setHistoryValues(null)
    setHelmAllValues(false); prevAllValues.current = null
    fetchedRef.current = {}
    const t = modal.type
    setViewFormat(t === 'describe' ? 'describe' : 'yaml')
    setEditMode(t === 'edit')
    setShowLineNumbers(t === 'edit')  // edit screens default to line numbers on (#57)
    if (t === 'logs')               fetchLogs()
    else if (t.startsWith('helm-')) fetchHelmContent(t)
  }, [modal?.type, modal?.item?.id])

  // Lazily fetch the active inspect view (describe/yaml/json); cached per item+format.
  // Edit mode edits the current format (yaml or json); describe isn't editable so it
  // falls back to yaml.
  useEffect(() => {
    if (!modal || !isInspect) return
    const fmt = (editMode && viewFormat === 'describe') ? 'yaml' : viewFormat
    const key = `${modal.item.id}|${fmt}`
    if (fetchedRef.current[key]) return
    fetchedRef.current[key] = true
    if (fmt === 'json')          fetchJson()
    else if (fmt === 'describe') fetchDescribe()
    else                         fetchYaml()
  }, [modal?.item?.id, modal?.type, viewFormat, editMode, isInspect])

  // Seed the edit buffer from the active format's raw content. Re-runs if the fetch
  // arrives after edit opens (e.g. describe→edit forces a fresh yaml fetch). Content
  // is stable during an edit session (no refetch), so this won't clobber edits.
  useEffect(() => {
    if (!editMode) return
    setEditContent(viewFormat === 'json' ? jsonContent : content)
  }, [editMode, viewFormat, content, jsonContent])

  // Re-fetch helm values when toggling user ↔ all (skips the initial mount fetch)
  useEffect(() => {
    if (modal?.type !== 'helm-values') return
    if (prevAllValues.current === null) { prevAllValues.current = helmAllValues; return }
    if (prevAllValues.current === helmAllValues) return
    prevAllValues.current = helmAllValues
    fetchHelmContent('helm-values')
  }, [helmAllValues, modal?.type])

  // Re-fetch logs when controls change
  const prevControls = useRef(null)
  useEffect(() => {
    if (!modal || modal.type !== 'logs') return
    const key = `${logTail}|${logSince}|${logContainer}|${logPodFilter}`
    if (prevControls.current === null) { prevControls.current = key; return }
    if (prevControls.current === key) return
    prevControls.current = key
    fetchLogs()
  }, [logTail, logSince, logContainer, logPodFilter, modal?.type])

  // Auto-scroll logs
  useEffect(() => {
    if (modal?.type === 'logs' && logAutoScroll && scrollRef.current && !loading)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [content, loading, logAutoScroll, modal?.type])

  // Reset matchIndex when search/filter changes
  useEffect(() => { setMatchIndex(0) }, [logFilter, search])

  // Scroll to current match (describe/yaml). Only while a search is active — otherwise
  // clearing the filter would fire with stale match refs and snap the view to the top.
  // With this guard the scroll position stays on the last match the user jumped to (#47).
  useEffect(() => {
    if (modal?.type === 'logs' || !search) return
    const el = matchRefs.current[matchIndex]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [matchIndex, modal?.type, search])

  // Scroll to current match in logs
  useEffect(() => {
    if (modal?.type !== 'logs' || !logFilter) return
    const el = matchRefs.current[matchIndex]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [matchIndex, modal?.type, logFilter])

  // Focus search input when activated
  useEffect(() => {
    if (searchActive) setTimeout(() => searchRef.current?.focus(), 30)
  }, [searchActive])

  // ── Copy ─────────────────────────────────────────────────────────────────

  const doCopy = useCallback(() => {
    if (!modal) return
    // Copy what's on screen: edit buffer, the active describe/yaml/json view, or filtered logs.
    const text = modal.type === 'logs'
      ? (logFilter ? filteredLogLines.join('\n') : content)
      : (isInspect && editMode) ? editContent
      : isInspect ? displayContent
      : content
    if (!text) return
    navigator.clipboard?.writeText(text)
    setCopyFlash(true)
    setTimeout(() => setCopyFlash(false), 1200)
  }, [modal, content, logFilter, filteredLogLines, isInspect, editMode, editContent, displayContent])

  // ── Vim key handler ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!modal) return

    const onKey = e => {
      const tag     = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'SELECT'
      const inspect = modal.type === 'describe' || modal.type === 'yaml' || modal.type === 'edit'

      // Edit mode: CodeMirror owns every key (vim motions/operators, Esc, ':' ex,
      // '/' search, '?' help). Yield entirely so nothing here intercepts first.
      if (editMode) return

      // Esc: step back through read-view / logs states, then close.
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        if (searchActive || search) { setSearchActive(false); setSearch(''); setMatchIndex(0); return }
        if (logFilter) { setLogFilter(''); setMatchIndex(0); return }
        closeModal()
        return
      }

      if (inInput) return

      // Tab: in the Helm values modal, toggle USER / ALL (computed) values
      if (modal.type === 'helm-values' && e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation()
        setHelmAllValues(v => !v)
        return
      }

      // Tab / Shift+Tab: cycle describe / yaml / json in the read view
      if (inspect && e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation()
        const order = ['describe', 'yaml', 'json']
        const i = order.indexOf(viewFormat)
        const next = e.shiftKey
          ? order[(i - 1 + order.length) % order.length]
          : order[(i + 1) % order.length]
        setViewFormat(next)
        return
      }

      // 'e' from a read view: enter edit mode in the current format (json stays json).
      // describe isn't editable, so it falls back to yaml. Line numbers on by default.
      if (inspect && e.key === 'e') {
        e.preventDefault(); e.stopPropagation()
        if (viewFormat === 'describe') setViewFormat('yaml')
        setEditMode(true)
        setShowLineNumbers(true)
        return
      }

      // 'x': toggle secret base64 decode (k9s-style). YAML and JSON decode in place; only
      // DESCRIBE (no decodable data block) snaps to YAML decoded.
      if (inspect && modal.resource === 'secrets' && e.key === 'x') {
        e.preventDefault(); e.stopPropagation()
        if (viewFormat === 'describe') { setViewFormat('yaml'); setSecretDecoded(true) }
        else setSecretDecoded(v => !v)
        return
      }

      // ── Read-view / logs scroll + search nav ──────────────────────────────
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      const halfPage = scrollEl.clientHeight / 2

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault(); e.stopPropagation()
          scrollEl.scrollBy({ top: 22 })
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault(); e.stopPropagation()
          scrollEl.scrollBy({ top: -22 })
          break
        case 'G':
          e.preventDefault(); e.stopPropagation()
          scrollEl.scrollTo({ top: scrollEl.scrollHeight })
          break
        case 'g': {
          const now = Date.now()
          if (now - lastGRef.current < 400) {
            e.preventDefault(); e.stopPropagation()
            scrollEl.scrollTo({ top: 0 })
          }
          lastGRef.current = now
          break
        }
        case 'd':
          if (e.ctrlKey) { e.preventDefault(); e.stopPropagation(); scrollEl.scrollBy({ top:  halfPage }) }
          break
        case 'u':
          if (e.ctrlKey) { e.preventDefault(); e.stopPropagation(); scrollEl.scrollBy({ top: -halfPage }) }
          break
        case 'f':
          if (e.ctrlKey) { e.preventDefault(); e.stopPropagation(); scrollEl.scrollBy({ top:  scrollEl.clientHeight }) }
          break
        case 'b':
          if (e.ctrlKey) { e.preventDefault(); e.stopPropagation(); scrollEl.scrollBy({ top: -scrollEl.clientHeight }) }
          break
        case '/':
          e.preventDefault(); e.stopPropagation()
          if (modal.type === 'logs') filterRef.current?.focus()
          else setSearchActive(true)
          break
        case 'n': {
          e.preventDefault(); e.stopPropagation()
          const total = modal.type === 'logs' ? logMatchCount : nonLogMatchCount
          if (total > 0) setMatchIndex(i => (i + 1) % total)
          break
        }
        case 'N': {
          e.preventDefault(); e.stopPropagation()
          const total = modal.type === 'logs' ? logMatchCount : nonLogMatchCount
          if (total > 0) setMatchIndex(i => (i - 1 + total) % total)
          break
        }
        case 'c':
          if (!e.ctrlKey) { e.preventDefault(); e.stopPropagation(); doCopy() }
          break
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [modal, closeModal, searchActive, search, logFilter, logMatchCount, nonLogMatchCount, doCopy, editMode, viewFormat, matchIndex])

  // ── Save ──────────────────────────────────────────────────────────────────

  // Read the live editor text (CodeMirror owns the buffer) with a state fallback.
  const editText = () => editViewRef.current?.state.doc.toString() ?? editContent
  // Secret decode/encode is format-specific (yaml `data:` block vs json `data` object).
  const transformSecret = (text, decode) => viewFormat === 'json'
    ? transformSecretJsonData(text, decode)
    : transformSecretDataSection(text, decode)

  const handleSave = async () => {
    setEditSaving(true); setEditResult(null)
    try {
      const text = editText()
      const body = (modal?.resource === 'secrets' && secretDecoded)
        ? transformSecret(text, false)
        : text
      const res  = await fetch('/api/edit', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body })
      const data = await res.json()
      setEditResult(data)
      return data
    } catch (err) { const r = { ok: false, error: err.message }; setEditResult(r); return r }
    finally      { setEditSaving(false) }
  }

  // Vim ex-commands, dispatched from VimEditor: :w save, :wq/:x save+close, :q/:q! back to read.
  const onVimSave      = () => { handleSave() }
  const onVimSaveClose = async () => { const r = await handleSave(); if (r?.ok) closeModal() }
  const onVimQuit      = () => { setEditMode(false) }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!modal) return null
  const { type, item, resource } = modal

  const isHelm = type.startsWith('helm-')
  // Inspect view color tracks the active format (describe = purple, yaml/json/edit = cyan).
  const inspectColor = editMode ? '#00d4ff' : viewFormat === 'describe' ? '#aa55ff' : '#00d4ff'
  const lineColor = type === 'logs' ? '#00ffaa'
    : isInspect ? inspectColor
    : (type === 'helm-values' || type === 'helm-manifest') ? '#00d4ff'
    : type === 'helm-history' ? '#ff8844'
    : type === 'helm-notes' ? '#ffaa00'
    : '#aa55ff'
  const displayName = resource.startsWith('cr:') ? resource.slice(3).split('/').pop() : resource
  const isYamlOrEdit = isInspect  // retained name for downstream conditionals
  const typeLabel = type === 'helm-values' ? (helmAllValues ? 'ALL VALUES' : 'VALUES')
    : type === 'helm-manifest' ? 'MANIFEST' : type === 'helm-notes' ? 'NOTES'
    : type === 'helm-history' ? 'HISTORY'
    : isInspect ? (editMode ? `EDIT ${viewFormat.toUpperCase()}` : viewFormat.toUpperCase())
    : type.toUpperCase()

  const containerOptions = item.containers?.length > 1
    ? [{ label: 'all containers', value: '' }, ...item.containers.map(c => ({ label: c, value: c }))]
    : []
  const podOptions = logPods.length > 1
    ? [{ label: `all (${logPods.length})`, value: 'all' }, ...logPods.map(p => ({ label: p, value: p }))]
    : []

  // Active search term for content rendering
  const activeSearch  = type === 'logs' ? logFilter : search
  const totalMatches  = type === 'logs' ? logMatchCount : nonLogMatchCount
  const isSecret      = resource === 'secrets'

  const editNormal = editMode && editVimMode && vimMode === 'normal'
  const editInsert = editMode && editVimMode && vimMode === 'insert'
  const editVisual = editMode && editVimMode && vimMode === 'visual'

  // For logs, filtered lines carry their own match index (mutable counter in render)
  let logMatchN = -1

  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 50,
        background: 'rgba(1,5,14,0.88)', backdropFilter: 'blur(8px)',
      }}
      onClick={closeModal}
    >
      <div
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          borderRadius: 8, overflow: 'hidden',
          width: (isYamlOrEdit || type === 'helm-history') ? 'min(920px, 94vw)' : 'min(860px, 92vw)',
          height: 'min(640px, 86vh)',
          background: 'rgba(2,10,22,0.98)',
          border: `1px solid ${lineColor}28`,
          boxShadow: `0 0 50px ${lineColor}12`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', flexShrink: 0,
          borderBottom: `1px solid ${lineColor}18`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: lineColor }}>
              {typeLabel}
            </span>
            <span style={{ fontSize: 11, color: '#3a6a8a' }}>
              {displayName.slice(0, -1)} / {item.name}
              {item.namespace && <span style={{ color: '#2a5070' }}> · {item.namespace}</span>}
            </span>
            {activeSearch && totalMatches > 0 && (
              <span style={{ fontSize: 10, color: '#ffcc44', letterSpacing: '0.06em' }}>
                {matchIndex + 1}/{totalMatches} matches
              </span>
            )}
            {isSecret && isInspect && (viewFormat === 'yaml' || viewFormat === 'json' || editMode) && (
              <button
                onClick={() => {
                  if (editMode) {
                    // CodeMirror owns the buffer: transform the live text and push it back
                    // through the `value` prop (VimEditor syncs it into the doc).
                    setEditContent(transformSecret(editText(), !secretDecoded))
                  }
                  setSecretDecoded(v => !v)
                }}
                title={secretDecoded ? 'Re-encode secret values' : 'Decode base64 secret values'}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                  color: secretDecoded ? '#ff8844' : '#5a8aaa',
                  background: secretDecoded ? 'rgba(255,136,68,0.12)' : 'rgba(0,212,255,0.06)',
                  border: `1px solid ${secretDecoded ? 'rgba(255,136,68,0.4)' : 'rgba(0,212,255,0.18)'}`,
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >{secretDecoded ? '🔓 Decoded' : '🔒 Decode'}</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#1e3a52' }}>ESC · close</span>
            <button onClick={closeModal}
              style={{ fontSize: 18, lineHeight: 1, color: '#3a5a7a', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              onMouseEnter={e => e.target.style.color = '#c0d8f0'}
              onMouseLeave={e => e.target.style.color = '#3a5a7a'}
            >×</button>
          </div>
        </div>

        {/* ── Log controls ──────────────────────────────────────────── */}
        {type === 'logs' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px',
            flexShrink: 0, flexWrap: 'wrap',
            borderBottom: `1px solid ${lineColor}10`,
            background: 'rgba(0,0,0,0.2)',
          }}>
            <ControlSelect label="Tail"  value={logTail}       onChange={setLogTail}       options={TAIL_OPTIONS}  />
            <ControlSelect label="Since" value={logSince}      onChange={setLogSince}      options={SINCE_OPTIONS} />
            {containerOptions.length > 0 && (
              <ControlSelect label="Container" value={logContainer} onChange={setLogContainer} options={containerOptions} />
            )}
            {podOptions.length > 0 && (
              <ControlSelect label="Pod" value={logPodFilter} onChange={setLogPodFilter} options={podOptions} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 140 }}>
              <span style={{ fontSize: 9, color: '#3a6a8a', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>/</span>
              <input
                ref={filterRef}
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); filterRef.current?.blur() }
                  if (e.key === 'Escape') { e.preventDefault(); setLogFilter(''); filterRef.current?.blur() }
                }}
                placeholder="grep…"
                style={{
                  flex: 1, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)',
                  color: '#c0d8f0', fontSize: 10, padding: '2px 6px', borderRadius: 3,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              {logFilter && (
                <span style={{ fontSize: 9, color: '#ffcc44' }}>
                  {matchIndex + 1}/{filteredLogLines.length}
                </span>
              )}
            </div>
            <button onClick={fetchLogs} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
              color: lineColor, background: `${lineColor}12`, border: `1px solid ${lineColor}30`,
              fontFamily: 'inherit',
            }}>↺</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={logAutoScroll} onChange={e => setLogAutoScroll(e.target.checked)}
                style={{ accentColor: lineColor }} />
              <span style={{ fontSize: 9, color: '#3a6a8a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>scroll</span>
            </label>
          </div>
        )}

        {/* ── Content ───────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}
          onScroll={e => {
            if (type === 'logs') {
              const el = e.currentTarget
              if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && logAutoScroll)
                setLogAutoScroll(false)
            }
          }}
        >
          {loading && (
            <div style={{ fontSize: 11, color: lineColor, opacity: 0.7 }}>
              {type === 'logs' ? 'Fetching logs...' : `Loading ${type}...`}
            </div>
          )}
          {fetchError && !loading && (
            <div style={{ fontSize: 11, color: '#ff6677' }}>Error: {fetchError}</div>
          )}
          {!loading && !fetchError && (
            <>
              {/* LOGS */}
              {type === 'logs' && (() => {
                logMatchN = -1
                const lines = logFilter ? filteredLogLines : logLines
                return (
                  <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11 }}>
                    {lines.map((line, i) => {
                      const isMatch = !!logFilter
                      if (isMatch) logMatchN++
                      const mn = isMatch ? logMatchN : -1
                      return (
                        <div key={i} ref={isMatch ? (el => { if (el) matchRefs.current[mn] = el }) : undefined}>
                          <LogLine line={line} search={logFilter || null} isCurrent={isMatch && mn === matchIndex} />
                        </div>
                      )
                    })}
                    {lines.length === 0 && (
                      <div style={{ color: '#3a6a8a', fontStyle: 'italic' }}>No log output.</div>
                    )}
                  </div>
                )
              })()}

              {/* DESCRIBE / YAML / JSON — unified read view */}
              {isInspect && !editMode && (
                <ContentLines
                  lines={contentLines}
                  kind={viewFormat === 'describe' ? 'describe' : 'yaml'}
                  search={activeSearch}
                  lineToMatchIdx={lineToMatchIdx}
                  matchIndex={matchIndex}
                  showLineNumbers={showLineNumbers}
                  matchRefs={matchRefs}
                  emptyLabel={`No ${viewFormat}.`}
                />
              )}

              {isInspect && editMode && (
                <div style={{ height: '100%', minHeight: 400, border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
                  <VimEditor
                    value={editContent}
                    onChange={v => { setEditContent(v); setEditResult(null) }}
                    vimEnabled={editVimMode}
                    showLineNumbers={showLineNumbers}
                    language={viewFormat === 'json' ? 'json' : 'yaml'}
                    editorRef={editViewRef}
                    onSave={onVimSave}
                    onSaveClose={onVimSaveClose}
                    onQuit={onVimQuit}
                    onRequestHelp={() => setVimHelp(true)}
                    onModeChange={setVimMode}
                  />
                </div>
              )}

              {/* HELM VALUES / MANIFEST — YAML viewer (line numbers + search via ContentLines) */}
              {(type === 'helm-values' || type === 'helm-manifest') && (
                <ContentLines
                  lines={contentLines}
                  kind="yaml"
                  search={activeSearch}
                  lineToMatchIdx={lineToMatchIdx}
                  matchIndex={matchIndex}
                  showLineNumbers={showLineNumbers}
                  matchRefs={matchRefs}
                  emptyLabel="No content."
                />
              )}

              {/* HELM NOTES — describe-style viewer */}
              {type === 'helm-notes' && (
                <ContentLines
                  lines={contentLines}
                  kind="describe"
                  search={activeSearch}
                  lineToMatchIdx={lineToMatchIdx}
                  matchIndex={matchIndex}
                  showLineNumbers={false}
                  matchRefs={matchRefs}
                  emptyLabel="No notes."
                />
              )}

              {/* HELM HISTORY — revision values peek */}
              {type === 'helm-history' && historyValues && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button onClick={() => setHistoryValues(null)} style={{
                      fontSize: 10, padding: '2px 10px', borderRadius: 3, cursor: 'pointer',
                      color: '#ff8844', background: 'rgba(255,136,68,0.08)', border: '1px solid rgba(255,136,68,0.3)',
                      fontFamily: 'inherit',
                    }}>← History</button>
                    <span style={{ fontSize: 11, color: '#ff8844', letterSpacing: '0.06em' }}>
                      Revision {historyValues.revision} · user values
                    </span>
                  </div>
                  {historyValuesBusy
                    ? <div style={{ fontSize: 11, color: '#ff8844', opacity: 0.7 }}>Loading values…</div>
                    : <ContentLines
                        lines={(historyValues.content || '').split('\n')}
                        kind="yaml" search={null} lineToMatchIdx={{}} matchIndex={-1}
                        showLineNumbers={showLineNumbers} matchRefs={matchRefs}
                        emptyLabel="No user-supplied values for this revision." />}
                </div>
              )}

              {/* HELM HISTORY — table with rollback */}
              {type === 'helm-history' && !historyValues && (
                <div>
                  {helmHistory.length === 0 && !loading && (
                    <div style={{ color: '#3a6a8a', fontStyle: 'italic', fontSize: 11 }}>No history available.</div>
                  )}
                  {helmHistory.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(0,212,255,0.15)' }}>
                          {['REV', 'UPDATED', 'STATUS', 'CHART', 'DESCRIPTION', ''].map(h => (
                            <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 10, color: '#4a7a9a', letterSpacing: '0.08em', fontWeight: 'normal' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {helmHistory.map(row => {
                          const isDeployed = row.status === 'deployed'
                          const rbStatus = helmRollbackStatus[row.revision]
                          return (
                            <tr key={row.revision} style={{
                              borderBottom: '1px solid rgba(0,212,255,0.06)',
                              background: isDeployed ? 'rgba(0,255,170,0.04)' : 'transparent',
                            }}>
                              <td style={{ padding: '6px 8px', color: '#00d4ff', fontFamily: 'monospace' }}>{row.revision}</td>
                              <td style={{ padding: '6px 8px', color: '#3a6a8a', fontFamily: 'monospace', fontSize: 10 }}>{row.updated}</td>
                              <td style={{ padding: '6px 8px', color: isDeployed ? '#00ffaa' : '#667788' }}>{row.status}</td>
                              <td style={{ padding: '6px 8px', color: '#aa55ff' }}>{row.chart}</td>
                              <td style={{ padding: '6px 8px', color: '#5a8aaa', fontSize: 10 }}>{row.description}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button
                                  onClick={() => fetchRevisionValues(row.revision)}
                                  style={{
                                    fontSize: 10, padding: '2px 10px', borderRadius: 3, cursor: 'pointer', marginRight: 6,
                                    color: '#00ffaa', background: 'rgba(0,255,170,0.08)', border: '1px solid rgba(0,255,170,0.25)',
                                    fontFamily: 'inherit',
                                  }}
                                >Values</button>
                                {!isDeployed && (
                                  <button
                                    onClick={() => doRollback(row.revision)}
                                    disabled={rbStatus === 'rolling'}
                                    style={{
                                      fontSize: 10, padding: '2px 10px', borderRadius: 3, cursor: rbStatus === 'rolling' ? 'default' : 'pointer',
                                      color: rbStatus === 'ok' ? '#00ffaa' : rbStatus === 'err' ? '#ff4455' : '#ff8844',
                                      background: 'rgba(255,136,68,0.08)',
                                      border: '1px solid rgba(255,136,68,0.3)',
                                      fontFamily: 'inherit', opacity: rbStatus === 'rolling' ? 0.6 : 1,
                                    }}
                                  >
                                    {rbStatus === 'rolling' ? '…' : rbStatus === 'ok' ? '✓ Done' : rbStatus === 'err' ? '✗ Error' : 'Rollback'}
                                  </button>
                                )}
                                {isDeployed && (
                                  <span style={{ fontSize: 10, color: '#00ffaa' }}>● current</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Inline search bar (describe/yaml/edit-vim) ────────────── */}
        {searchActive && type !== 'logs' && !editMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', flexShrink: 0,
            borderTop: `1px solid rgba(255,204,68,0.2)`, background: 'rgba(255,204,68,0.04)',
          }}>
            <span style={{ fontSize: 11, color: '#ffcc44' }}>/</span>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.blur() }
                if (e.key === 'Escape') { e.preventDefault(); setSearchActive(false); setSearch(''); setMatchIndex(0) }
              }}
              placeholder="search…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#ffee88', fontSize: 11, fontFamily: 'inherit',
              }}
            />
            {search && nonLogMatchCount > 0 && (
              <span style={{ fontSize: 10, color: '#ffcc44' }}>{matchIndex + 1}/{nonLogMatchCount}</span>
            )}
            {search && nonLogMatchCount === 0 && (
              <span style={{ fontSize: 10, color: '#ff6677' }}>no matches</span>
            )}
            <span style={{ fontSize: 9, color: '#4a6a6a' }}>n/N · navigate · Esc · close</span>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 16px', flexShrink: 0,
          borderTop: `1px solid ${lineColor}12`,
          background: 'rgba(0,0,0,0.25)',
        }}>
          {/* Left: stats + vim hints */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {type === 'logs' && !loading && (
              <span style={{ fontSize: 10, color: '#2a5070' }}>
                {logFilter ? `${filteredLogLines.length} matching` : `${logLines.length}`} lines
                {isMulti && logPodFilter === 'all' && logPods.length > 0 && (
                  <span style={{ color: '#1e3a52' }}> · {logPods.length} pods</span>
                )}
              </span>
            )}
            {/* Line numbers toggle (inspect views, edit mode, helm yaml views) */}
            {(isInspect || type === 'helm-values' || type === 'helm-manifest') && (
              <button onClick={() => setShowLineNumbers(v => !v)} title="Toggle line numbers"
                style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 3, cursor: 'pointer',
                  color: showLineNumbers ? '#00d4ff' : '#3a5a7a',
                  background: showLineNumbers ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${showLineNumbers ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>#</button>
            )}
            {/* Copy button */}
            {(isInspect ? (editMode ? !!editContent : !!displayContent) : ((type === 'logs' || isHelm) && content)) && !loading && (
              <button onClick={doCopy} style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 3, cursor: 'pointer',
                color: copyFlash ? '#00ffaa' : '#4a8ab8',
                background: copyFlash ? 'rgba(0,255,170,0.1)' : 'rgba(0,212,255,0.06)',
                border: `1px solid ${copyFlash ? 'rgba(0,255,170,0.3)' : 'rgba(0,212,255,0.15)'}`,
                fontFamily: 'inherit', transition: 'all 0.2s',
              }}>{copyFlash ? '✓ Copied' : 'Copy'} <span style={{ opacity: 0.5, fontSize: 9 }}>c</span></button>
            )}
            {/* Edit apply result */}
            {editMode && editResult && (
              <span style={{ fontSize: 10, color: editResult.ok ? '#00ffaa' : '#ff6677' }}>
                {editResult.ok ? `✓ ${editResult.output || 'Applied'}` : `✗ ${editResult.error}`}
              </span>
            )}
            {/* Key hints — edit-mode vim keys live in the ? overlay (CodeMirror owns them) */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
              {!editMode && <VimHint k="j/k" label="scroll" />}
              {!editMode && <VimHint k="gg/G" label="top/bottom" />}
              {isInspect && !editMode && <VimHint k="Tab" label="describe/yaml/json" />}
              {type === 'helm-values' && <VimHint k="Tab" label="user/all" />}
              {isInspect && !editMode && <VimHint k="e" label="edit" />}
              {!editMode && <VimHint k="/" label="search" />}
              {!editMode && <VimHint k="n/N" label="next/prev" />}
              {isSecret && isInspect && !editMode && <VimHint k="x" label="decode" />}
              {editMode && editVimMode && <VimHint k="?" label="vim keys" />}
            </span>
          </div>

          {/* Right: view/edit controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Helm values: user ↔ all (computed) toggle */}
            {type === 'helm-values' && !loading && (
              <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,212,255,0.18)' }}>
                {[{ k: false, l: 'USER' }, { k: true, l: 'ALL' }].map(({ k, l }) => (
                  <button key={l} onClick={() => setHelmAllValues(k)} style={{
                    fontSize: 9, padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.08em',
                    color: helmAllValues === k ? '#00d4ff' : '#3a5a7a',
                    background: helmAllValues === k ? 'rgba(0,212,255,0.15)' : 'transparent',
                    border: 'none', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>{l}</button>
                ))}
              </div>
            )}
            {/* DESCRIBE/YAML/JSON format toggle (inspect read mode only) */}
            {isInspect && !editMode && (
              <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(0,212,255,0.18)' }}>
                {['describe', 'yaml', 'json'].map(fmt => (
                  <button key={fmt} onClick={() => setViewFormat(fmt)} style={{
                    fontSize: 9, padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.08em',
                    color: viewFormat === fmt ? (fmt === 'describe' ? '#aa55ff' : '#00d4ff') : '#3a5a7a',
                    background: viewFormat === fmt ? (fmt === 'describe' ? 'rgba(170,85,255,0.15)' : 'rgba(0,212,255,0.15)') : 'transparent',
                    border: 'none', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>{fmt.toUpperCase()}</button>
                ))}
              </div>
            )}
            {/* Edit mode controls */}
            {isYamlOrEdit && editMode && (
              <>
                {resource === 'pods' && (
                  <span style={{ fontSize: 10, color: '#3a5060' }}>most pod fields are immutable</span>
                )}
                <button
                  onClick={() => { setEditVimMode(v => !v); setVimMode('normal') }}
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                    color: editVimMode ? '#ffcc00' : '#3a5a7a',
                    background: editVimMode ? 'rgba(255,204,0,0.1)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${editVimMode ? 'rgba(255,204,0,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    fontFamily: 'inherit', letterSpacing: '0.08em', transition: 'all 0.15s',
                  }}
                >VIM</button>
                {editVimMode && (() => {
                  const mode = editInsert ? 'INSERT' : editVisual ? 'VISUAL' : 'NORMAL'
                  const col  = mode === 'INSERT' ? '#00ffaa' : mode === 'VISUAL' ? '#ff8844' : '#ffcc00'
                  return (
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3, letterSpacing: '0.1em',
                      color: col, background: `${col}14`, border: `1px solid ${col}33`,
                    }}>{mode}</span>
                  )
                })()}
                <button
                  onClick={handleSave} disabled={editSaving}
                  style={{
                    fontSize: 11, padding: '3px 14px', borderRadius: 4, cursor: editSaving ? 'default' : 'pointer',
                    color: editSaving ? '#2a6a5a' : '#00ffaa',
                    background: editSaving ? 'rgba(0,255,170,0.05)' : 'rgba(0,255,170,0.1)',
                    border: `1px solid ${editSaving ? 'rgba(0,255,170,0.15)' : 'rgba(0,255,170,0.4)'}`,
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >{editSaving ? 'Applying…' : '✓ Apply'}</button>
              </>
            )}
          </div>
        </div>
      </div>

      {vimHelp && <VimHelpOverlay onClose={() => setVimHelp(false)} />}
    </div>
  )
}
