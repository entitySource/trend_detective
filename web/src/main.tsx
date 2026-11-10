import { lazy, StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CommandCenter from './CommandCenter.tsx'
import { ErrorBoundary } from './components/LoadError'
import './command.css'
import './index.css'

// The trend map pulls in MapLibre (most of the bundle), so it loads only when opened.
// MapLibre looks for its worker next to its own module, which bundling moves; the worker file is
// self-contained, so ship it as a plain asset and point MapLibre at it.
const App = lazy(async () => {
  const [{ setWorkerUrl }, worker, app] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('./App.tsx')])
  setWorkerUrl(worker.default)
  return app
})
// The reading pages load on demand too, so the globe (the landing view) ships less code.
const ChecksPage = lazy(() => import('./Guide.tsx').then((m) => ({ default: m.ChecksPage })))
const MethodsPage = lazy(() => import('./Guide.tsx').then((m) => ({ default: m.MethodsPage })))

const loading = (label: string) => (
  <div className="cc-grid flex h-screen items-center justify-center font-mono tracking-[0.3em] text-cyan-300">{label}</div>
)

// Views over the same data: the globe command center (default), the detailed trend map (#/map), and the
// reading pages on how it works (#/methods) and how it compares with published science (#/checks).
function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const view = hash === '#/checks' || hash === '#/methods' || hash === '#/map' ? hash : '#/'
  // Keyed by view: a crash (or a lazy chunk that fails to download) is contained to that view, and leaving it resets.
  return (
    <ErrorBoundary key={view}>
      {view === '#/checks' || view === '#/methods' ? (
        <Suspense fallback={loading('LOADING…')}>{view === '#/checks' ? <ChecksPage /> : <MethodsPage />}</Suspense>
      ) : view === '#/map' ? (
        <Suspense fallback={loading('LOADING MAP…')}>
          <App />
        </Suspense>
      ) : (
        <CommandCenter />
      )}
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
