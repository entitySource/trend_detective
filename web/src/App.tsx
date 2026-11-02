// Detailed trend map (#/map): every 0.5° cell's trend for one clue and time of year, in the same HUD style as the
// globe command center. Click the map to read one cell; click a pulsing site to see its regional verdict and
// jump to its case file on the globe.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, ImageSource, Map as MlMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110m from 'world-atlas/countries-110m.json'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Clock, Crosshair, HelpCircle, Layers, Minus, Plus, Radar, Search, ShieldCheck, X } from 'lucide-react'
import { DEFINITIONS, INTERESTS, SITES, type Site } from './command/content'
import { VERDICT_COLOR, verdictOf, type Verdict } from './command/trend'
import { dataUrl, type Manifest, type RegionsFile, type Season } from './contract'
import { splitAtAntimeridian } from './lib/geo'
import { cellIndex, loadGrid, readCell } from './lib/grid'

type LayerKind = 'slope' | 'raw' | 'class'
type Probe = { lat: number; lon: number; slope: number | null; p: number | null; q: number | null; snr: number | null } | null

const SEASON_LABEL: Record<Season, string> = { ANN: 'Whole year', DJF: 'Dec–Feb', MAM: 'Mar–May', JJA: 'Jun–Aug', SON: 'Sep–Nov' }
const LAYERS: { id: LayerKind; label: string; hint: string }[] = [
  { id: 'slope', label: 'How fast it changes', hint: 'Colour shows the speed of change per decade, whether or not it is proven.' },
  { id: 'raw', label: 'Real? Each spot alone', hint: 'Each cell tested on its own, with no correction for testing thousands of cells at once.' },
  { id: 'class', label: 'Real? After the luck check', hint: 'Only cells that survive the correction for testing so many cells (false discovery rate).' },
]
const VERDICT_LABEL: Record<Verdict, string> = { rising: 'Really rising', falling: 'Really falling', noise: 'Not proven yet', unknown: 'No data here' }

const topo = countries110m as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
const BORDERS = splitAtAntimeridian(mesh(topo, topo.objects.countries, (a, b) => a !== b))
const COAST = splitAtAntimeridian(mesh(topo, topo.objects.land, (a, b) => a === b))
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const fmt = (x: number | null | undefined, digits = 3) => (x == null || !Number.isFinite(x) ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(digits))
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
const boxPolygon = ([w, s, e, n]: Site['bbox']): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
})
// Rough distance in degrees, good enough to rank nearby sites.
// Percent with one decimal near 0 and 100, so 0.1% and 99.6% do not round to a misleading 0% and 100%.
const pct = (x: number) => `${(x > 0 && x < 1) || (x > 99 && x < 100) ? x.toFixed(1) : x.toFixed(0)}%`
const near = (s: Site, lat: number, lon: number) => Math.hypot(s.lat - lat, (s.lon - lon) * Math.cos((lat * Math.PI) / 180))

// Circular gauge: how sure we are the change is not luck (1 − p).
function Gauge({ value, label, sub, color }: { value: number; label: string; sub: string; color: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 84 84" className="h-24 w-24" role="img" aria-label={`${sub}: ${label}`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`}
          transform="rotate(-90 42 42)"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="42" y="47" textAnchor="middle" className="fill-slate-50 font-mono text-[15px] font-semibold">
          {label}
        </text>
      </svg>
      <p className="mt-1 text-center text-xs text-slate-400">{sub}</p>
    </div>
  )
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [varId, setVarId] = useState<string>('')
  const [season, setSeason] = useState<Season>('ANN')
  const [kind, setKind] = useState<LayerKind>('slope')
  const [projection, setProjection] = useState<'mercator' | 'globe'>('globe')
  // The map controls fold into one pill so they never cover the map.
  const [panelOpen, setPanelOpen] = useState(true)
  const [probe, setProbe] = useState<Probe>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [regions, setRegions] = useState<RegionsFile | null>(null)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<string>('all')
  const [now, setNow] = useState(() => new Date())
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const markers = useRef<Record<string, Marker>>({})
  const searchEl = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(dataUrl('manifest.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}. Run pipeline/scripts/make_mock.py first.`)
        return r.json() as Promise<Manifest>
      })
      .then((m) => {
        setManifest(m)
        setVarId(m.variables[0].id)
        setSeason(m.seasons[0])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Ctrl/Cmd + K jumps to the clue search; Escape closes the inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchEl.current?.focus()
      } else if (e.key === 'Escape') {
        setProbe(null)
        setSiteId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const variable = manifest?.variables.find((v) => v.id === varId)
  const layer = variable?.layers[season]
  const overlayUrl = layer ? dataUrl((kind === 'raw' ? layer.raw : layer[kind]) ?? layer.class) : null

  // Regional series for the chosen clue: verdicts for the site markers, the inspector and the stats dock.
  useEffect(() => {
    if (!variable) return
    let live = true
    fetch(dataUrl(variable.regions))
      .then((r) => r.json() as Promise<RegionsFile>)
      .then((f) => live && setRegions(f))
      .catch(() => live && setRegions(null))
    return () => {
      live = false
    }
  }, [variable])

  const siteStats = (id: string) => (regions?.variable === varId ? regions.regions.find((r) => r.id === id)?.seasons[season]?.stats : undefined)
  const verdicts = useMemo(() => {
    const out: Record<string, Verdict> = {}
    for (const s of SITES) out[s.id] = verdictOf(regions?.variable === varId ? regions.regions.find((r) => r.id === s.id)?.seasons[season]?.stats : undefined)
    return out
  }, [regions, varId, season])

  // Create the map once the manifest is in.
  useEffect(() => {
    if (!manifest || !mapEl.current || map.current) return
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {
          land: { type: 'geojson', data: LAND },
          borders: { type: 'geojson', data: BORDERS },
          coast: { type: 'geojson', data: COAST },
        },
        layers: [
          { id: 'ocean', type: 'background', paint: { 'background-color': '#030a14' } },
          { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#0b1724' } },
        ],
      },
      center: [20, 20],
      zoom: 1.2,
      minZoom: 0.6,
      maxZoom: 7,
      renderWorldCopies: false,
      attributionControl: false,
    })
    m.on('load', () => {
      m.addSource('trend', { type: 'image', url: overlayUrl ?? '', coordinates: manifest.overlayBounds })
      m.addLayer({ id: 'trend', type: 'raster', source: 'trend', paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0.9 } })
      m.addLayer({ id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#22d3ee', 'line-width': 0.5, 'line-opacity': 0.25 } })
      m.addLayer({ id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': '#67e8f9', 'line-width': 0.8, 'line-opacity': 0.55 } })
      m.addSource('focus', { type: 'geojson', data: EMPTY })
      m.addLayer({ id: 'focus-fill', type: 'fill', source: 'focus', paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.08 } })
      m.addLayer({ id: 'focus-line', type: 'line', source: 'focus', paint: { 'line-color': '#22d3ee', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
    })
    // One pulsing marker per investigation site (the whole-world site has no single place to pin).
    for (const s of SITES.filter((x) => x.id !== 'glb')) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'td-node'
      el.setAttribute('aria-label', `${s.name}: show its regional trend`)
      el.title = s.name
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        setProbe(null)
        setSiteId(s.id)
      })
      markers.current[s.id] = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m)
    }
    map.current = m
    return () => {
      m.remove()
      map.current = null
      markers.current = {}
    }
    // overlayUrl is applied by the effect below once the map has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest])

  // Swap the overlay image when the clue, season or layer changes.
  useEffect(() => {
    const m = map.current
    if (!m || !manifest || !overlayUrl) return
    const apply = () => (m.getSource('trend') as ImageSource | undefined)?.updateImage({ url: overlayUrl, coordinates: manifest.overlayBounds })
    // The source exists once the map has loaded; before that, the load handler creates it with this URL.
    if (m.getSource('trend')) apply()
    else m.once('load', apply)
  }, [overlayUrl, manifest])

  // Flat map (Mercator, stretches the poles) or globe (true shapes everywhere).
  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => m.setProjection({ type: projection })
    if (m.isStyleLoaded()) apply()
    else m.once('load', apply)
  }, [projection, manifest])

  // Colour each site marker by its verdict, and ring the selected one.
  useEffect(() => {
    for (const [id, mk] of Object.entries(markers.current)) {
      const el = mk.getElement()
      el.style.setProperty('--node', VERDICT_COLOR[verdicts[id] ?? 'unknown'])
      el.classList.toggle('on', id === siteId)
    }
  }, [verdicts, siteId, manifest])

  // Outline the selected site's averaging box and fly to it.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const s = SITES.find((x) => x.id === siteId)
    const apply = () => (m.getSource('focus') as GeoJSONSource | undefined)?.setData(s && s.id !== 'glb' ? boxPolygon(s.bbox) : EMPTY)
    if (m.getSource('focus')) apply()
    else m.once('load', apply)
    if (s && s.id !== 'glb') {
      const [w, so, e, n] = s.bbox
      m.fitBounds(
        [
          [w, so],
          [e, n],
        ],
        // Leave room for the inspector on wide maps; on narrow ones it covers the map anyway.
        m.getContainer().clientWidth > 900
          ? { padding: { top: 120, bottom: 120, left: 80, right: 420 }, maxZoom: 4.5, duration: 900 }
          : { padding: 30, maxZoom: 4.5, duration: 900 },
      )
    }
  }, [siteId])

  // Click anywhere: read the exact stored numbers for that cell.
  useEffect(() => {
    const m = map.current
    if (!m || !manifest || !layer) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat
      const cell = cellIndex(manifest.grid, lat, lng)
      setSiteId(null)
      if (!cell) return setProbe(null)
      loadGrid(dataUrl(layer.grid), manifest.grid)
        .then((data) => setProbe({ lat, lon: lng, ...readCell(data, manifest.grid, cell.row, cell.col) }))
        .catch((err: Error) => setError(err.message))
    }
    m.on('click', onClick)
    return () => {
      m.off('click', onClick)
    }
  }, [manifest, layer])

  if (error) return <p className="cc-grid flex h-screen items-center justify-center p-6 text-rose-300">{error}</p>
  if (!manifest || !variable) return <div className="cc-grid flex h-screen items-center justify-center font-mono tracking-[0.3em] text-cyan-300">LOADING MAP…</div>

  const def = DEFINITIONS[varId]
  const short = def?.short ?? variable.label
  const [lo, hi] = variable.colorRange
  const sig = layer?.sigArea
  const counts = (['rising', 'falling', 'noise'] as const).map((v) => SITES.filter((s) => verdicts[s.id] === v).length)
  const site = SITES.find((s) => s.id === siteId)
  const sStats = site ? siteStats(site.id) : undefined
  const sVerdict = verdictOf(sStats)
  const cellReal = probe?.q != null && probe.q <= manifest.fdrAlpha
  const cellVerdict: Verdict = probe?.slope == null ? 'unknown' : cellReal ? (probe.slope > 0 ? 'rising' : 'falling') : 'noise'
  const nearby = probe ? SITES.filter((s) => s.id !== 'glb').sort((a, b) => near(a, probe.lat, probe.lon) - near(b, probe.lat, probe.lon)).slice(0, 3) : []
  const q = query.trim().toLowerCase()
  const groups = INTERESTS.filter((g) => topic === 'all' || g.id === topic)
    .map((g) => ({
      ...g,
      vars: manifest.variables.filter((v) => (g.vars as readonly string[]).includes(v.id) && (!q || `${v.label} ${DEFINITIONS[v.id]?.short ?? ''}`.toLowerCase().includes(q))),
    }))
    .filter((g) => g.vars.length)

  return (
    <div className="cc-grid relative flex min-h-screen flex-col font-sans text-slate-200 lg:h-screen lg:overflow-hidden">
      <div className="cc-scan pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-transparent via-cyan-400/5 to-transparent" />

      {/* Header */}
      <header className="cc-glass relative z-10 m-3 mb-0 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-cyan-300" />
          <h1 className="cc-glow text-sm font-bold tracking-[0.25em] text-cyan-200">TREND DETECTIVE</h1>
          <span className="hidden text-xs tracking-[0.2em] text-slate-500 sm:inline">// TREND MAP</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[13px] text-slate-400 max-md:hidden">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            {now.toISOString().slice(0, 19).replace('T', ' ')} UTC
          </span>
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${manifest.mock ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${manifest.mock ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {manifest.mock ? 'MOCK FEED' : `NASA DATA ${manifest.window.start.slice(0, 4)}–${manifest.window.end.slice(0, 4)}`}
          </span>
        </div>
        <nav className="ml-auto flex flex-wrap gap-2 text-xs">
          <a href="#/" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-cyan-200 transition hover:bg-cyan-400/10">
            <ArrowLeft className="h-3.5 w-3.5" /> Globe
          </a>
          <a href="#/methods" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-cyan-200 transition hover:bg-cyan-400/10">
            <HelpCircle className="h-3.5 w-3.5" /> <span className="max-sm:hidden">How it works</span>
          </a>
          <a href="#/checks" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-cyan-200 transition hover:bg-cyan-400/10">
            <ShieldCheck className="h-3.5 w-3.5" /> <span className="max-sm:hidden">Can you trust it?</span>
          </a>
        </nav>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 gap-3 p-3 max-lg:flex-col">
        {/* Left rail: find and pick a clue */}
        <aside className="cc-glass flex shrink-0 flex-col overflow-hidden rounded-xl max-lg:max-h-[38vh] lg:w-80 2xl:w-96">
          <ScrollArea className="min-h-0 flex-1" viewportClassName="flex flex-col gap-4 p-5" label="Clues">
          <section>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-cyan-400">CHOOSE A CLUE</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">Each clue is something NASA satellites measure. The map colours every 55 km square of Earth.</p>
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2 focus-within:border-cyan-400/60">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                ref={searchEl}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clues"
                aria-label="Search clues"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
              <kbd className="rounded border border-slate-700 px-1.5 font-mono text-[11px] text-slate-500 max-sm:hidden">Ctrl K</kbd>
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[{ id: 'all', label: 'All' }, ...INTERESTS].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopic(t.id)}
                  aria-pressed={topic === t.id}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${topic === t.id ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.25)]' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            {groups.map((g) => (
              <div key={g.id}>
                <p className="mb-1.5 text-xs font-medium text-slate-500">{g.label}</p>
                <div className="space-y-1">
                  {g.vars.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVarId(v.id)}
                      aria-pressed={v.id === varId}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${v.id === varId ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-transparent text-slate-300 hover:border-cyan-400/25 hover:bg-cyan-400/5'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block">{DEFINITIONS[v.id]?.short ?? v.label}</span>
                        <span className="block truncate text-xs text-slate-500">{v.label}</span>
                      </span>
                      {v.caution && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="read the caution" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && <p className="text-sm text-slate-500">No clue matches “{query}”.</p>}
          </section>

          <section className="rounded-lg border border-cyan-400/20 bg-slate-950/40 p-3">
            <p className="text-sm font-semibold text-cyan-100">
              <HelpCircle className="mr-1.5 inline h-4 w-4 text-cyan-400" />
              What is “{short.toLowerCase()}”?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{def?.plain ?? variable.label}</p>
            {def && <p className="mt-1.5 text-xs text-slate-500">Measured by: {def.source}</p>}
          </section>
          {variable.caution && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-100">
              <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-400" />
              <strong className="font-semibold">Be careful:</strong> {variable.caution}
            </p>
          )}
          {!!manifest.catalogue?.length && (
            <details className="text-sm text-slate-400">
              <summary className="cursor-pointer text-xs font-semibold tracking-[0.15em] text-cyan-400">MORE CLUES COMING · {manifest.catalogue.length}</summary>
              <ul className="mt-2 space-y-1">
                {manifest.catalogue.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 text-xs" title={[c.product, c.caution ? `Caution: ${c.caution}` : '', c.note].filter(Boolean).join(' · ')}>
                    <span className="text-slate-300">{c.label}</span>
                    <span className="shrink-0 text-slate-500">{c.sphere}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          </ScrollArea>
        </aside>

        {/* Map column: canvas with floating HUD controls, then the stats dock */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="cc-glass relative min-h-0 flex-1 overflow-hidden rounded-xl max-lg:flex max-lg:flex-col">
            {/* On small screens the controls and legend stack around the map instead of floating over it. */}
            <div className="relative h-full max-lg:order-2 max-lg:h-[55vh]">
              {/* h-full, not absolute: MapLibre's own (unlayered) CSS forces position: relative on this element. */}
              <div ref={mapEl} className="h-full w-full" role="application" aria-label={`Map of ${variable.label} trend`} />
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
                <button onClick={() => map.current?.zoomIn()} className="cc-glass rounded-lg p-2 text-cyan-200 transition hover:text-cyan-50" aria-label="Zoom in">
                  <Plus className="h-4 w-4" />
                </button>
                <button onClick={() => map.current?.zoomOut()} className="cc-glass rounded-lg p-2 text-cyan-200 transition hover:text-cyan-50" aria-label="Zoom out">
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Layer and time-of-year controls */}
            {panelOpen ? (
              <div className="cc-glass z-10 rounded-xl p-2 max-lg:order-1 max-lg:m-2 lg:absolute lg:top-3 lg:left-3 lg:w-[300px]">
                <div className="mb-1 flex items-center justify-between px-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.15em] text-cyan-400">
                    <Layers className="h-3.5 w-3.5" /> WHAT THE COLOURS SHOW
                  </p>
                  <button onClick={() => setPanelOpen(false)} className="rounded p-0.5 text-slate-500 transition hover:text-cyan-200 max-lg:hidden" aria-label="Fold the map controls away" title="Fold away">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {LAYERS.filter((l) => l.id !== 'raw' || layer?.raw).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setKind(l.id)}
                      aria-pressed={kind === l.id}
                      title={l.hint}
                      className={`rounded-md border px-2 py-1 text-xs transition ${kind === l.id ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'border-slate-700/70 text-slate-300 hover:border-cyan-400/40'}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-2 px-1" title={projection === 'globe' ? 'True shapes and sizes everywhere, including the poles. Drag to turn it.' : 'Easy to scan, but stretches places near the poles.'}>
                  <span className="w-11 shrink-0 text-[11px] font-semibold tracking-[0.12em] text-cyan-400">SHAPE</span>
                  <SegmentedControl
                    className="[&_[role=tab]]:py-1.5 [&_[role=tab]]:text-xs"
                    compact={false}
                    value={projection}
                    onChange={(v) => setProjection(v as typeof projection)}
                    options={[
                      { value: 'mercator', label: 'Flat map' },
                      { value: 'globe', label: 'Globe' },
                    ]}
                  />
                </div>
                <div className="mt-1.5 flex items-start gap-2 px-1">
                  <span className="mt-1 w-11 shrink-0 text-[11px] font-semibold tracking-[0.12em] text-cyan-400">WHEN</span>
                  <div className="flex flex-wrap gap-1">
                    {manifest.seasons.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSeason(s)}
                        aria-pressed={s === season}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition ${s === season ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100' : 'border-slate-700/70 text-slate-400 hover:text-slate-200'}`}
                      >
                        {SEASON_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPanelOpen(true)}
                className="cc-glass z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-cyan-100 transition hover:text-cyan-50 lg:absolute lg:top-3 lg:left-3"
                aria-label="Show the map controls"
              >
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                {LAYERS.find((l) => l.id === kind)?.label} · {SEASON_LABEL[season]}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}

            {/* Legend */}
            <div className="cc-glass z-10 rounded-xl p-2.5 max-lg:order-3 max-lg:m-2 lg:absolute lg:bottom-3 lg:left-3 lg:w-56">
              {kind === 'slope' ? (
                <>
                  <p className="text-[11px] font-semibold tracking-[0.15em] text-cyan-400">SPEED OF CHANGE</p>
                  <div className="mt-1.5 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${variable.palette.join(', ')})` }} />
                  <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
                    <span>{fmt(lo, 2)}</span>
                    <span>0</span>
                    <span>+{fmt(hi, 2)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{variable.trendUnits}</p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold tracking-[0.15em] text-cyan-400">{kind === 'raw' ? 'EACH SPOT TESTED ALONE' : 'AFTER THE LUCK CHECK'}</p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <i className="h-3 w-3 rounded-sm" style={{ background: variable.palette.at(-1) }} /> Really rising
                    </li>
                    <li className="flex items-center gap-2">
                      <i className="h-3 w-3 rounded-sm" style={{ background: variable.palette[0] }} /> Really falling
                    </li>
                    <li className="flex items-center gap-2">
                      <i className="h-3 w-3 rounded-sm border border-slate-600 bg-slate-800/60" /> Not proven (natural ups and downs?)
                    </li>
                  </ul>
                </>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 border-t border-slate-700/60 pt-1.5 text-[11px] leading-snug text-slate-400">
                <span className="td-legend-node shrink-0" /> Dots are sites. Click a dot or any spot.
              </p>
            </div>

            {/* Inspector: a clicked cell or a clicked site */}
            {(probe || site) && (
              <aside className="cc-glass cc-slide absolute top-3 right-14 bottom-3 z-20 flex w-[min(360px,calc(100%-4.5rem))] flex-col overflow-y-auto rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.2em] text-cyan-400">{site ? 'INVESTIGATION SITE' : 'MAP SQUARE · 55 KM'}</p>
                    <h2 className="cc-glow mt-0.5 text-lg leading-snug font-semibold text-cyan-50">{site ? site.name : `${fmtLat(probe!.lat)}, ${fmtLon(probe!.lon)}`}</h2>
                    <p className="mt-0.5 font-mono text-[13px] text-slate-500">
                      <Crosshair className="mr-1 inline h-3 w-3" />
                      {short} · {SEASON_LABEL[season]}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setProbe(null)
                      setSiteId(null)
                    }}
                    className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {site ? (
                  <>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">{site.story.takeaway}</p>
                    {sStats && sStats.slopePerDecade !== null ? (
                      <>
                        <div className="mt-4 rounded-lg border p-3" style={{ borderColor: `${VERDICT_COLOR[sVerdict]}66`, background: `${VERDICT_COLOR[sVerdict]}14` }}>
                          <p className="text-base font-semibold" style={{ color: VERDICT_COLOR[sVerdict] }}>
                            {VERDICT_LABEL[sVerdict]}
                          </p>
                          <p className="mt-0.5 font-mono text-[13px] text-slate-300">
                            {sStats.slopePerDecade > 0 ? '+' : ''}
                            {fmt(sStats.slopePerDecade)} {variable.trendUnits}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">Average over the dashed box, one value per year.</p>
                        </div>
                        <div className="mt-4 flex justify-around">
                          <Gauge value={sStats.p === null ? 0 : 1 - sStats.p} label={sStats.p === null ? '–' : `${Math.floor(100 * (1 - sStats.p))}%`} sub="Sure it is not luck" color={VERDICT_COLOR[sVerdict]} />
                          <Gauge value={Math.min(1, Math.abs(sStats.snr ?? 0) / 2)} label={fmt(sStats.snr, 2)} sub="Trend vs. wobble" color="#22d3ee" />
                        </div>
                      </>
                    ) : (
                      <p className="mt-4 rounded-lg border border-slate-700/70 p-3 text-sm text-slate-400">This clue has nothing to measure at {site.name}. Try another clue on the left.</p>
                    )}
                    <a
                      href={`#/?v=${varId}&s=${site.id}`}
                      className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-cyan-300/50 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 py-2.5 text-sm font-semibold text-cyan-50 transition hover:from-cyan-500/30 hover:to-emerald-500/30"
                    >
                      Open the full case file <ChevronRight className="h-4 w-4" />
                    </a>
                  </>
                ) : (
                  probe && (
                    <>
                      <p className="mt-4 font-mono text-2xl font-semibold text-slate-50">
                        {probe.slope === null ? 'No data' : `${probe.slope > 0 ? '+' : ''}${fmt(probe.slope)}`}
                      </p>
                      {probe.slope !== null && <p className="text-xs text-slate-400">{variable.trendUnits}</p>}
                      {probe.slope !== null && (
                        <>
                          <p className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: `${VERDICT_COLOR[cellVerdict]}66`, color: VERDICT_COLOR[cellVerdict] }}>
                            {cellReal ? 'A real change, not just luck' : 'Not proven: could be natural ups and downs'}
                          </p>
                          <div className="mt-4 flex justify-around">
                            <Gauge value={probe.p === null ? 0 : 1 - probe.p} label={probe.p === null ? '–' : `${Math.floor(100 * (1 - probe.p))}%`} sub="Sure it is not luck (this square alone)" color={VERDICT_COLOR[cellVerdict]} />
                            <Gauge value={Math.min(1, Math.abs(probe.snr ?? 0) / 2)} label={fmt(probe.snr, 2)} sub="Trend vs. wobble" color="#22d3ee" />
                          </div>
                          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 font-mono text-[13px]">
                            <dt className="text-slate-500">Chance it is luck (p)</dt>
                            <dd className="text-right text-slate-200">{fmt(probe.p)}</dd>
                            <dt className="text-slate-500">After the luck check (q)</dt>
                            <dd className="text-right text-slate-200">{fmt(probe.q)}</dd>
                          </dl>
                        </>
                      )}
                      {nearby.length > 0 && (
                        <>
                          <p className="mt-5 text-xs font-semibold tracking-[0.15em] text-cyan-400">NEAREST INVESTIGATION SITES</p>
                          <ul className="mt-2 space-y-1">
                            {nearby.map((s) => (
                              <li key={s.id}>
                                <button
                                  onClick={() => {
                                    setProbe(null)
                                    setSiteId(s.id)
                                  }}
                                  className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-cyan-400/25 hover:bg-cyan-400/5"
                                >
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: VERDICT_COLOR[verdicts[s.id]], boxShadow: `0 0 8px ${VERDICT_COLOR[verdicts[s.id]]}` }} />
                                  <span className="flex-1 text-sm text-slate-100">{s.name}</span>
                                  <span className="text-xs text-slate-500">{VERDICT_LABEL[verdicts[s.id]]}</span>
                                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-300" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  )
                )}
              </aside>
            )}
          </div>

          {/* Stats dock: real numbers for this clue and time of year */}
          <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Looks real, each spot alone', value: sig ? pct(sig.raw) : '–', sub: 'of the mapped area', color: '#94a3b8' },
              { label: 'Survives the luck check', value: sig ? pct(sig.fdr) : '–', sub: 'of the mapped area', color: '#22d3ee' },
              { label: 'Could be flukes', value: sig && sig.raw > 0 ? pct(100 * (1 - sig.fdr / sig.raw)) : '–', sub: 'of the raw hotspots', color: '#fbbf24' },
              { label: `Sites, ${SEASON_LABEL[season].toLowerCase()}`, value: `${counts[0]} ▲ ${counts[1]} ▼`, sub: `${counts[2]} not proven of ${SITES.length}`, color: '#34d399' },
            ].map((c) => (
              <div key={c.label} className="cc-glass rounded-xl px-4 py-3">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold" style={{ color: c.color, textShadow: `0 0 12px ${c.color}66` }}>
                  {c.value}
                </p>
                <p className="text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
