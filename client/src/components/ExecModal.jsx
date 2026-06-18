import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { alpha } from '../theme'
import { useStore } from '../store'

const ACCENT = 'var(--mz-accent-2)'

const kbdStyle = {
  fontFamily: 'monospace', fontSize: 10, padding: '1px 5px', borderRadius: 3,
  color: ACCENT, background: alpha(ACCENT, 8), border: `1px solid ${alpha(ACCENT, 30)}`,
}

// Pull a real color string out of a CSS var for xterm (which needs concrete colors, not vars).
const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

export function ExecModal() {
  const execModal = useStore(s => s.execModal)
  const closeExec = useStore(s => s.closeExec)

  // shells: null = still probing, [] = none found, [..] = available (best-first).
  const [shells, setShells] = useState(null)
  const [shell, setShell] = useState(null)
  const [detectError, setDetectError] = useState('')
  const [status, setStatus] = useState('connecting') // 'connecting' | 'open' | 'closed' | 'error'
  const [statusMsg, setStatusMsg] = useState('')
  const hostRef = useRef(null)

  // Probe the container for available shells when the modal opens. Only the ones that exist
  // are offered; the terminal auto-connects to the best (first) one.
  useEffect(() => {
    if (!execModal) return
    let cancelled = false
    setShells(null); setShell(null); setDetectError(''); setStatus('connecting'); setStatusMsg('')
    const { namespace, pod, container } = execModal
    const q = container ? `?container=${encodeURIComponent(container)}` : ''
    fetch(`/api/exec/shells/${encodeURIComponent(namespace || 'default')}/${encodeURIComponent(pod)}${q}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.demo)  { setShells([]); setDetectError('Exec is not available in demo mode.'); return }
        if (d.error) { setShells([]); setDetectError(d.error); return }
        const found = d.shells || []
        setShells(found)
        if (found.length) setShell(found[0])
      })
      .catch(e => { if (!cancelled) { setShells([]); setDetectError(e.message || 'Shell detection failed.') } })
    return () => { cancelled = true }
  }, [execModal])

  // Terminal + websocket lifecycle. Runs once a shell is chosen (and re-runs when you switch
  // shells, tearing down and reconnecting). No-op while probing / when no shell exists.
  useEffect(() => {
    if (!execModal || !shell) return
    const host = hostRef.current
    if (!host) return

    setStatus('connecting'); setStatusMsg('')

    const term = new Terminal({
      fontFamily: 'monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: cssVar('--mz-bg', '#0a1220'),
        foreground: cssVar('--mz-text', '#d8e6f0'),
        cursor: cssVar('--mz-accent-2', '#5fb0d0'),
        // xterm's color parser doesn't understand color-mix(), so build a concrete rgba
        // from the token's -rgb triplet rather than alpha().
        selectionBackground: `rgba(${cssVar('--mz-accent-2-rgb', '95,176,208')},0.3)`,
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    try { fit.fit() } catch { /* host not measured yet */ }

    const { namespace, pod, container } = execModal
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams({
      namespace: namespace || 'default', pod, shell,
      cols: String(term.cols || 80), rows: String(term.rows || 24),
    })
    if (container) params.set('container', container)
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/exec?${params}`)
    ws.binaryType = 'arraybuffer'

    const enc = new TextEncoder()
    const sendResize = () => {
      if (ws.readyState !== 1) return
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let msg; try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.type === 'ready') { setStatus('open'); term.focus() }
        // A clean shell exit (typing `exit` / Ctrl-D) drops you back to the list.
        else if (msg.type === 'exit') { closeExec() }
        else if (msg.type === 'error') { setStatus('error'); setStatusMsg(msg.message || 'error') }
        return
      }
      term.write(new Uint8Array(ev.data))
    }
    ws.onerror = () => { setStatus('error'); setStatusMsg('connection error') }
    // Socket dropped while the shell was live (pod gone, etc.) - also drop out, unless we're
    // holding the modal open to show an error.
    ws.onclose = () => setStatus(s => {
      if (s === 'open') { closeExec(); return 'closed' }
      return s === 'connecting' ? 'closed' : s
    })

    const dataSub = term.onData(d => { if (ws.readyState === 1) ws.send(enc.encode(d)) })

    // Keep the pty sized to the visible terminal.
    const ro = new ResizeObserver(() => { try { fit.fit() } catch { /* noop */ } sendResize() })
    ro.observe(host)
    const onWinResize = () => { try { fit.fit() } catch { /* noop */ } sendResize() }
    window.addEventListener('resize', onWinResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      dataSub.dispose()
      try { ws.close() } catch { /* noop */ }
      term.dispose()
    }
  }, [execModal, shell, closeExec])

  // Breakout handler: when the shell is NOT live (still probing, never connected, errored,
  // exited, or no shell found) there is no terminal owning the keys, so Esc / Ctrl-D have
  // nothing to escape to - let them close the modal. While the shell IS live ('open') we do
  // nothing here so xterm keeps Esc and Ctrl-D (useKeys.js early-returns on execModal too).
  // Capture phase so we beat anything else; only acts on the not-connected states.
  useEffect(() => {
    if (!execModal) return
    if (status === 'open') return
    const onKey = (e) => {
      const isEsc = e.key === 'Escape'
      const isCtrlD = (e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')
      if (!isEsc && !isCtrlD) return
      e.preventDefault()
      e.stopPropagation()
      closeExec()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [execModal, status, closeExec])

  if (!execModal) return null
  const { label, namespace } = execModal

  const dot = status === 'open' ? 'var(--mz-ok)'
    : status === 'error' ? 'var(--mz-danger)'
    : status === 'closed' ? 'var(--mz-text-faint)' : 'var(--mz-warn)'

  const noShell = Array.isArray(shells) && shells.length === 0

  return (
    <div
      onClick={closeExec}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(960px, 95vw)', height: 'min(620px, 88vh)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: `1px solid ${alpha(ACCENT, 19)}`, boxShadow: `0 0 50px ${alpha(ACCENT, 7)}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>SHELL</span>
            {!noShell && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />}
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
              {namespace && <span style={{ color: 'var(--mz-text-faint)' }}> · {namespace}</span>}
              {statusMsg && <span style={{ color: status === 'error' ? 'var(--mz-danger-2)' : 'var(--mz-text-faint)', marginLeft: 8 }}>{statusMsg}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Shell switcher - only the shells that actually exist in the container. */}
            {shells === null
              ? <span style={{ fontSize: 10, color: 'var(--mz-text-faint)', fontStyle: 'italic' }}>detecting…</span>
              : shells.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {shells.map(sh => {
                    const active = sh === shell
                    return (
                      <button key={sh} onClick={() => setShell(sh)}
                        style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
                          color: active ? 'var(--mz-bg)' : ACCENT,
                          background: active ? ACCENT : alpha(ACCENT, 8),
                          border: `1px solid ${active ? ACCENT : alpha(ACCENT, 30)}`,
                          fontWeight: active ? 'bold' : 'normal', transition: 'all 0.12s',
                        }}>{sh.replace(/^.*\//, '')}</button>
                    )
                  })}
                </div>
              )}
            {!noShell && (
              <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>
                {status === 'open' ? 'ctrl-d · exit' : 'esc / ctrl-d · close'}
              </span>
            )}
            <button onClick={closeExec}
              style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
              onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
            >×</button>
          </div>
        </div>

        {/* Body: probing / no-shell message / terminal */}
        <div style={{ flex: 1, minHeight: 0, padding: '8px 10px', background: 'var(--mz-bg)' }}>
          {shells === null && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--mz-text-dim)', fontSize: 12 }}>
              Detecting available shells…
            </div>
          )}
          {noShell && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--mz-warn-2)' }}>
                {detectError || 'No shell found in this container.'}
              </span>
              {!detectError && (
                <span style={{ fontSize: 11, color: 'var(--mz-text-faint)', maxWidth: 460 }}>
                  This image has none of sh / bash / zsh / ash / dash (e.g. a distroless or scratch
                  image). There is nothing to exec into.
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--mz-text-faint)', marginTop: 4 }}>
                Press <kbd style={kbdStyle}>Esc</kbd> or <kbd style={kbdStyle}>Ctrl-D</kbd> to close.
              </span>
            </div>
          )}
          {shells && shells.length > 0 && (
            <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </div>
    </div>
  )
}
