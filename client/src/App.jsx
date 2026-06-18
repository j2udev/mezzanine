import { Component } from 'react'
import { HUD } from './components/HUD'
import { Sidebar } from './components/Sidebar'
import { LoadingScreen } from './components/LoadingScreen'
import { ResourceList } from './components/ResourceList'
import { NotConnected } from './components/NotConnected'
import { DeleteModal } from './components/DeleteModal'
import { ThemePicker } from './components/ThemePicker'
import { useWS } from './hooks/useWS'
import { useKeys } from './hooks/useKeys'
import { useStore } from './store'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mz-bg)', padding: 40 }}>
          <pre style={{ color: 'var(--mz-danger)', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', maxWidth: 800 }}>
            {String(this.state.error)}{'\n'}{this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const PANEL_W = 310

export default function App() {
  useWS()
  useKeys()
  const sidebarCollapsed = useStore(s => s.sidebarCollapsed)
  const selectedId       = useStore(s => s.selectedId)
  const modal            = useStore(s => s.modal)
  const panelEnabled     = useStore(s => s.panelEnabled)
  // Re-render the tree on theme switch so JS-computed colors (statusColor/getNsColor)
  // re-resolve; CSS-var colors repaint on their own. Children aren't memoized, so an
  // App re-render cascades.
  useStore(s => s.themeId)
  // Collapsed sidebar is fully hidden (0 width): the collapse toggle now lives in the top-bar
  // wordmark (#13), so there's no rail control left to keep on screen. Frees list real estate.
  const sidebarW = sidebarCollapsed ? 0 : 200
  const panelOpen = panelEnabled && !!selectedId && !modal

  return (
    <ErrorBoundary>
      <div style={{ width: '100vw', height: '100vh', background: 'var(--mz-bg)', overflow: 'hidden', position: 'relative' }}>
        <Sidebar />
        <div style={{
          position: 'absolute',
          top: 44, bottom: 36,
          left: sidebarW, right: panelOpen ? PANEL_W : 0,
          overflow: 'hidden',
          transition: 'left 0.18s ease, right 0.2s ease',
        }}>
          <ResourceList />
          <NotConnected />
        </div>
        <HUD panelWidth={PANEL_W} />
        <DeleteModal />
        <ThemePicker />
        <LoadingScreen />
      </div>
    </ErrorBoundary>
  )
}
