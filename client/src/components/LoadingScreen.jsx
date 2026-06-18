import { useEffect, useState } from 'react'
import { useStore } from '../store'

export function LoadingScreen() {
  const pods        = useStore(s => s.pods)
  const deployments = useStore(s => s.deployments)
  const [ready, setReady] = useState(false)
  const [dots, setDots]   = useState('')

  const hasData = pods.length > 0 || deployments.length > 0

  // Clear as soon as data arrives - no artificial delay needed (no WebGL init in list mode)
  useEffect(() => {
    if (hasData) setReady(true)
  }, [hasData])

  // Hard timeout: never stay on loading screen longer than 4s
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (ready) return
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400)
    return () => clearInterval(t)
  }, [ready])

  if (ready) return null

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'var(--mz-bg)', pointerEvents: 'none' }}
    >
      <div className="mb-8 text-center">
        <div className="mezz-wordmark mb-2" style={{ fontSize: 64, lineHeight: 1 }}>
          mezza9
        </div>
        <div className="text-xs tracking-widest" style={{ color: 'var(--mz-accent-2)' }}>
          THE BEST SEAT IN THE THEATER
        </div>
      </div>

      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border border-cyan-900/40" />
        <div className="absolute inset-0 rounded-full border-t-2 border-r-2 animate-spin"
          style={{ borderColor: 'var(--mz-accent) transparent transparent transparent' }} />
        <div className="absolute inset-2 rounded-full border-b-2 animate-spin"
          style={{ borderColor: 'transparent transparent var(--mz-alt) transparent', animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>

      <div className="text-xs font-mono" style={{ color: 'var(--mz-accent-2)', minWidth: 160, textAlign: 'center' }}>
        {!hasData ? `Connecting to cluster${dots}` : `Loading${dots}`}
      </div>
    </div>
  )
}
