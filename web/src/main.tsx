import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import App from './App.tsx'
import CommandCenter from './CommandCenter.tsx'
import './command.css'
import './index.css'

// MapLibre looks for its worker next to its own module, which bundling moves.
// The worker file is self-contained, so ship it as a plain asset and point MapLibre at it.
setWorkerUrl(maplibreWorkerUrl)

// Two views over the same data: the globe command center (default) and the detailed trend map (#/map).
function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash === '#/map' ? <App /> : <CommandCenter />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
