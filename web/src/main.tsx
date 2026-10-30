import { lazy, StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CommandCenter from './CommandCenter.tsx'
import { ChecksPage, MethodsPage } from './Guide.tsx'
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

// Views over the same data: the globe command center (default), the detailed trend map (#/map), and the
// reading pages on how it works (#/methods) and how it compares with published science (#/checks).
function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  if (hash === '#/checks') return <ChecksPage />
  if (hash === '#/methods') return <MethodsPage />
  return hash === '#/map' ? (
    <Suspense fallback={<div className="cc-grid flex h-screen items-center justify-center font-mono tracking-[0.3em] text-cyan-300">LOADING MAP…</div>}>
      <App />
    </Suspense>
  ) : (
    <CommandCenter />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
