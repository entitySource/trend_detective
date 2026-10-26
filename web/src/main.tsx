import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import App from './App.tsx'
import './index.css'

// MapLibre looks for its worker next to its own module, which bundling moves.
// The worker file is self-contained, so ship it as a plain asset and point MapLibre at it.
setWorkerUrl(maplibreWorkerUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
