import { useEffect } from 'react'
import { useStore } from '../store'

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  // Always connect through the same host - Vite proxies /ws to the backend.
  // This works whether accessed via localhost, devcontainer forwarding, or tunnel.
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function useWS() {
  const setData = useStore(s => s.setData)
  const setConnected = useStore(s => s.setConnected)

  useEffect(() => {
    let ws
    let retryTimer
    let pollTimer
    let dead = false

    const loadData = () =>
      fetch('/api/data').then(r => r.json()).then(setData).catch(() => {})

    // HTTP polling fallback. The WebSocket upgrade doesn't survive every proxy/tunnel
    // (VS Code port-forward, ingress, etc. may strip the Upgrade header), which would
    // otherwise leave the UI frozen on the initial snapshot. The server refreshes
    // `latest` every 5s, so polling /api/data keeps data fresh whenever the WS isn't
    // carrying updates. The WS, when it connects, is preferred (lower latency) and
    // stops the poll.
    function startPolling() {
      if (pollTimer || dead) return
      pollTimer = setInterval(loadData, 5000)
    }
    function stopPolling() {
      clearInterval(pollTimer)
      pollTimer = null
    }

    function connect() {
      if (dead) return
      ws = new WebSocket(getWsUrl())
      ws.onopen = () => { setConnected(true); stopPolling() }
      ws.onclose = () => {
        setConnected(false)
        startPolling()                       // WS down → keep data fresh via polling
        retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'update') setData(msg.data)
        } catch {}
      }
    }

    loadData()      // immediate snapshot on mount
    startPolling()  // poll until the WS opens (cleared in onopen); covers WS-never-connects
    connect()

    return () => {
      dead = true
      clearTimeout(retryTimer)
      stopPolling()
      ws?.close()
    }
  }, [])
}
