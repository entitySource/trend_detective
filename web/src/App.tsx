import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ImageSource, Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110m from 'world-atlas/countries-110m.json'
import { dataUrl, type Manifest, type Season } from './contract'
import { splitAtAntimeridian } from './lib/geo'
import { cellIndex, loadGrid, readCell } from './lib/grid'

type LayerKind = 'slope' | 'raw' | 'class'
type Probe = { lat: number; lon: number; slope: number | null; p: number | null; q: number | null; snr: number | null } | null

const SEASON_LABEL: Record<Season, string> = { ANN: 'Whole year', DJF: 'Dec–Feb', MAM: 'Mar–May', JJA: 'Jun–Aug', SON: 'Sep–Nov' }

const topo = countries110m as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
const BORDERS = splitAtAntimeridian(mesh(topo, topo.objects.countries, (a, b) => a !== b))
const COAST = splitAtAntimeridian(mesh(topo, topo.objects.land, (a, b) => a === b))

const fmt = (x: number | null, digits = 3) => (x === null ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(digits))

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [varId, setVarId] = useState<string>('')
  const [season, setSeason] = useState<Season>('ANN')
  const [kind, setKind] = useState<LayerKind>('slope')
  const [probe, setProbe] = useState<Probe>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)

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

  const variable = manifest?.variables.find((v) => v.id === varId)
  const layer = variable?.layers[season]
  const overlayUrl = layer ? dataUrl((kind === 'raw' ? layer.raw : layer[kind]) ?? layer.class) : null

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
          { id: 'ocean', type: 'background', paint: { 'background-color': '#0e1726' } },
          { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#1f2a3a' } },
        ],
      },
      center: [20, 20],
      zoom: 1.2,
      minZoom: 0.6,
      maxZoom: 7,
      renderWorldCopies: false,
      attributionControl: false,
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('trend', { type: 'image', url: overlayUrl ?? '', coordinates: manifest.overlayBounds })
      m.addLayer({ id: 'trend', type: 'raster', source: 'trend', paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0.9 } })
      m.addLayer({ id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#c9d4e3', 'line-width': 0.6, 'line-opacity': 0.6 } })
      m.addLayer({ id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': '#e6edf6', 'line-width': 0.8 } })
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // overlayUrl is applied by the effect below once the map has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest])

  // Swap the overlay image when the variable, season or layer changes.
  useEffect(() => {
    const m = map.current
    if (!m || !manifest || !overlayUrl) return
    const apply = () => (m.getSource('trend') as ImageSource | undefined)?.updateImage({ url: overlayUrl, coordinates: manifest.overlayBounds })
    // The source exists once the map has loaded; before that, the load handler creates it with this URL.
    if (m.getSource('trend')) apply()
    else m.once('load', apply)
  }, [overlayUrl, manifest])

  // Click anywhere: read the exact stored numbers for that cell.
  useEffect(() => {
    const m = map.current
    if (!m || !manifest || !layer) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat
      const cell = cellIndex(manifest.grid, lat, lng)
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

  if (error) return <p className="fatal">{error}</p>
  if (!manifest || !variable) return <p className="loading">Loading…</p>

  const significant = probe?.q != null && probe.q <= manifest.fdrAlpha
  const [lo, hi] = variable.colorRange

  return (
    <div className="shell">
      <aside className="panel">
        <header>
          <h1>Trend Detective</h1>
          <a href="#/" className="back">
            ← Globe command center
          </a>
          <p className="sub">
            What is changing on Earth, where, how much, and is it real? {manifest.window.start.slice(0, 4)}–{manifest.window.end.slice(0, 4)}
          </p>
          {manifest.mock && <p className="mock">Mock data: synthetic patterns for building the app. Not real measurements.</p>}
        </header>

        <fieldset>
          <legend>Variable</legend>
          {manifest.variables.map((v) => (
            <label key={v.id} className={`choice ${v.id === varId ? 'on' : ''}`}>
              <input type="radio" name="var" value={v.id} checked={v.id === varId} onChange={() => setVarId(v.id)} />
              {v.label}
              {v.caution && <span className="caution-dot" title="Data-quality caution" aria-label="caution">!</span>}
            </label>
          ))}
          {variable.caution && (
            <p className="caution" role="note">
              <strong>Caution:</strong> {variable.caution}
            </p>
          )}
        </fieldset>

        {!!manifest.catalogue?.length && (
          <details className="catalogue">
            <summary>
              More variables <span className="count">{manifest.catalogue.length} catalogued</span>
            </summary>
            {([2, 3] as const).map((tier) => (
              <div key={tier}>
                <p className="tier">{tier === 2 ? 'Coming next' : 'Catalogued, trend pending'}</p>
                <ul>
                  {manifest.catalogue!
                    .filter((c) => c.tier === tier)
                    .map((c) => (
                      <li key={c.id} title={[c.product, c.caution ? `Caution: ${c.caution}` : '', c.note].filter(Boolean).join(' · ')}>
                        <span>
                          {c.label}
                          {c.caution && <span className="caution-badge">caution</span>}
                        </span>
                        <span className="sphere">{c.sphere}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </details>
        )}

        <fieldset>
          <legend>Season</legend>
          <div className="seg">
            {manifest.seasons.map((s) => (
              <button key={s} type="button" aria-pressed={s === season} onClick={() => setSeason(s)} title={SEASON_LABEL[s]}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Map shows</legend>
          <div className="seg">
            <button type="button" aria-pressed={kind === 'slope'} onClick={() => setKind('slope')}>
              How much
            </button>
            {layer?.raw && (
              <button type="button" aria-pressed={kind === 'raw'} onClick={() => setKind('raw')} title="Each cell tested on its own, no correction for testing thousands of cells">
                Significant (raw)
              </button>
            )}
            <button type="button" aria-pressed={kind === 'class'} onClick={() => setKind('class')} title="Corrected for testing thousands of cells at once (false discovery rate)">
              Significant (corrected)
            </button>
          </div>
          {layer?.sigArea && kind !== 'slope' && (
            <p className="sig-area">
              {layer.sigArea.raw}% of the map looks significant when each cell is tested alone; <strong>{layer.sigArea.fdr}%</strong> survives the correction.
              {layer.sigArea.raw > 0 && ` About ${Math.round(100 * (1 - layer.sigArea.fdr / layer.sigArea.raw))}% of the raw hotspots could be flukes from testing so many cells.`}
            </p>
          )}
        </fieldset>

        <div className="legend">
          {kind === 'slope' ? (
            <>
              <div className="ramp" style={{ background: `linear-gradient(90deg, ${variable.palette.join(', ')})` }} />
              <div className="ramp-labels">
                <span>{fmt(lo, 2)}</span>
                <span>0</span>
                <span>+{fmt(hi, 2)}</span>
              </div>
              <p className="units">{variable.trendUnits}</p>
            </>
          ) : (
            <ul className="keys">
              <li>
                <i style={{ background: variable.palette.at(-1) }} /> Significant rise
              </li>
              <li>
                <i style={{ background: variable.palette[0] }} /> Significant fall
              </li>
              <li>
                <i className="ns" /> Could be year-to-year noise
              </li>
              <li className="units">{kind === 'raw' ? `Significant = p ≤ ${manifest.fdrAlpha}, no correction` : `Significant = FDR q ≤ ${manifest.fdrAlpha}`}</li>
            </ul>
          )}
        </div>

        <section className="probe" aria-live="polite">
          {probe ? (
            <>
              <h2>
                {Math.abs(probe.lat).toFixed(1)}°{probe.lat >= 0 ? 'N' : 'S'}, {Math.abs(probe.lon).toFixed(1)}°{probe.lon >= 0 ? 'E' : 'W'}
              </h2>
              <p className="big">
                {probe.slope === null ? 'No data' : `${probe.slope > 0 ? '+' : ''}${fmt(probe.slope)} ${variable.trendUnits}`}
              </p>
              <p className={significant ? 'verdict yes' : 'verdict'}>{probe.slope === null ? '' : significant ? 'Significant change' : 'Not distinguishable from year-to-year noise'}</p>
              <dl>
                <dt>p (modified MK)</dt>
                <dd>{fmt(probe.p)}</dd>
                <dt>q (FDR)</dt>
                <dd>{fmt(probe.q)}</dd>
                <dt>Signal / noise</dt>
                <dd>{fmt(probe.snr, 2)}</dd>
              </dl>
            </>
          ) : (
            <p className="hint">Click the map to read the trend at any point.</p>
          )}
        </section>
      </aside>
      <div className="map" ref={mapEl} role="application" aria-label={`Map of ${variable.label} trend`} />
    </div>
  )
}
