// Trend Detective command center: a holographic globe of investigation sites, a case-file panel with a
// trend test, two-site comparison, a timeline slider that re-tests on fewer years, a guided "what / where"
// question flow and watchable demo cases. Reads the same contract files as the map view (manifest,
// regions/{var}.json, validation.json), so it shows real data as soon as the pipeline exports it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoDistance, geoEquirectangular, geoGraticule10, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110m from 'world-atlas/countries-110m.json'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  Database,
  Filter,
  GitCompare,
  Globe2,
  HelpCircle,
  Link2,
  Loader2,
  Map as MapIcon,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  Radar,
  Search,
  Sparkles,
  Sun,
  X,
  XCircle,
} from 'lucide-react'
import { dataUrl, type Manifest, type RegionSeries, type RegionsFile } from './contract'
import { DEFINITIONS, DEMOS, INTERESTS, LEADS, PLACES, SITES, type Biome, type Site } from './command/content'
import { quickTrend, turningPoint, VERDICT_COLOR, VERDICT_TEXT, verdictOf, type Verdict } from './command/trend'

// ---------- Data and helpers ----------

type Check = { id: string; name: string; status: 'pass' | 'fail' | 'pending'; note?: string }
type Theme = 'night' | 'day'

const topo = countries110m as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
const COAST = mesh(topo, topo.objects.land) as GeoPermissibleObjects
const GRATICULE = geoGraticule10()

// Point cloud for the hologram: a roughly even grid of dots over land (about 2° apart). Land is painted
// once onto a 1-pixel-per-degree canvas and sampled, which is thousands of times faster than geoContains.
let landDots: [number, number][] | null = null
function getLandDots(): [number, number][] {
  if (landDots) return landDots
  const c = document.createElement('canvas')
  c.width = 360
  c.height = 180
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const flat = geoEquirectangular().scale(180 / Math.PI).translate([180, 90])
  ctx.beginPath()
  geoPath(flat, ctx)(LAND)
  ctx.fill()
  const px = ctx.getImageData(0, 0, 360, 180).data
  const out: [number, number][] = []
  for (let lat = -84; lat <= 84; lat += 2) {
    const step = 2 / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
    for (let lon = -180; lon < 180; lon += step) {
      const i = Math.min(179, Math.floor(90 - lat)) * 360 + Math.min(359, Math.floor(lon + 180))
      if (px[i * 4 + 3] > 127) out.push([lon, lat])
    }
  }
  landDots = out
  return out
}

// Box outline as a densified line, so its edges follow parallels on the globe instead of great circles.
function boxOutline([w, s, e, n]: Site['bbox']): GeoPermissibleObjects {
  const pts: [number, number][] = []
  const step = (a: number, b: number) => {
    const k = Math.max(2, Math.ceil(Math.abs(b - a) / 2) + 1)
    return Array.from({ length: k }, (_, i) => a + ((b - a) * i) / (k - 1))
  }
  for (const x of step(w, e)) pts.push([x, s])
  for (const y of step(s, n)) pts.push([e, y])
  for (const x of step(e, w)) pts.push([x, n])
  for (const y of step(n, s)) pts.push([w, y])
  return { type: 'LineString', coordinates: pts }
}

type Stats = { slopePerDecade: number | null; p: number | null; n: number; totalChange: number | null; snr: number | null; ciLow: number | null; ciHigh: number | null; relChange?: number | null }
const COMPARE_COLOR = '#fbbf24'

const fmt = (x: number | null | undefined, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(d))
// Returns the comparison too, so text reads "p = 0.064" or "p < 0.001".
const fmtP = (p: number | null | undefined) => (p === null || p === undefined ? '= –' : p < 0.001 ? '< 0.001' : `= ${p.toFixed(3)}`)
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
// Units like "AOD/decade" read better spelled out.
const perDecade = (u: string) => u.replace(/\s*\/\s*decade$/, ' every 10 years').replace(/ per decade$/, ' every 10 years')

// Each step of the real method, in plain words (technical name in brackets for the curious).
const STAGES = [
  'Collecting 23 years of satellite measurements',
  'Taking out the normal summer–winter swing (seasonal anomalies)',
  'Averaging over the whole region, one value per year',
  'Asking: could a pattern like this happen by luck? (Mann-Kendall test)',
  'Measuring how fast it is changing (Sen’s slope)',
]

const DETECTIVE_STEPS = [
  { n: 1, title: 'Choose a clue', text: 'On the left, pick something satellites measure, like heat, rain, haze or how green plants are.' },
  { n: 2, title: 'Choose a place', text: 'Click a glowing dot on the globe or a name in the list. Each one is a region with a story.' },
  { n: 3, title: 'Look at the evidence', text: 'You will see one dot for every year from 2003 to 2025. Does it look like it goes up or down?' },
  { n: 4, title: 'Test it', text: 'Press “Test it”. The app checks if the change is real, or could just be natural ups and downs.' },
]

// Why a place can have no series for a clue: the thing being measured does not exist there.
const NO_DATA_REASON: Record<string, (place: string) => string> = {
  seaice: (p) => `Sea ice only forms on cold oceans, and there is none at ${p}, so there is nothing to measure here.`,
  sealevel: (p) => `Sea level is measured over the open ocean, and ${p} is inland, so there is no sea to measure.`,
  ndvi: (p) => `Greenness measures plants, and ${p} is almost all ice and snow, so there are no plants to see.`,
  soil: (p) => `Soil moisture needs soil, and ${p} is almost all ice, so the land model has nothing to measure.`,
  chlor: (p) => `Plankton is seen in open, sunlit water. At ${p} there are too few clear years of measurements to test a trend.`,
}
const noDataReason = (vid: string, place: string) =>
  NO_DATA_REASON[vid]?.(place) ?? `The satellites do not have enough measurements at ${place} for this clue to test a trend.`

// Friendly names for the place types used in the filters and site list.
const PLACE_LABEL: Record<string, string> = Object.fromEntries(PLACES.map((p) => [p.id, p.label]))

const EXPLAIN = {
  chart: 'Each dot is one year: how far that year was above (up) or below (down) this place’s usual level. The bright line is the trend; the dashed lines show how uncertain its steepness is.',
  p: 'The p-value is the chance of seeing a trend this strong if nothing were really changing. Below 0.05 (1 in 20) scientists call it “significant”. The ring shows 1 − p: fuller means less likely to be luck.',
  snr: 'Trend vs. wobble: how big the change is compared with the normal year-to-year ups and downs. Above 1, the trend stands out from the noise.',
  years: 'How many years had enough data to count. Years with too many missing months are left out.',
  rate: 'How much the value changes every 10 years, if the trend carries on at the same speed.',
  range: 'We are 95% sure the true speed lies between these two numbers. If the range crosses zero, we can’t even be sure of the direction.',
  total: 'Speed × time: roughly how much the value changed across the years tested.',
  timeline: 'Pretend it is an earlier year and re-run the test on only the data up to then. Short records rarely prove anything; watch the verdict change as evidence piles up.',
  compare: 'Put two places side by side. Same variable, same years, same test: do they move the same way?',
}

// ---------- URL state: #/?v=aod&s=eas&c=igp&y=2015&t=day ----------

type UrlState = { v?: string; s?: string; c?: string; y?: number; t?: Theme }
function readUrl(): UrlState {
  const q = new URLSearchParams(window.location.hash.replace(/^#\/?\??/, ''))
  const y = Number(q.get('y'))
  return {
    v: q.get('v') ?? undefined,
    s: q.get('s') ?? undefined,
    c: q.get('c') ?? undefined,
    y: Number.isFinite(y) && y > 0 ? y : undefined,
    t: q.get('t') === 'day' ? 'day' : q.get('t') === 'night' ? 'night' : undefined,
  }
}

// ---------- Small visual pieces ----------

function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="What does this mean?"
        aria-expanded={open}
        className="ml-1 align-middle text-cyan-400/70 hover:text-cyan-200"
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {open && (
        <span role="tooltip" className="cc-glass absolute top-5 right-0 z-30 w-60 rounded-lg p-2.5 text-left text-[13px] leading-relaxed font-normal tracking-normal text-slate-200 normal-case">
          {text}
        </span>
      )}
    </span>
  )
}

function Ring({ value, label, sub, color, info }: { value: number; label: string; sub: string; color: string; info: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-[76px] w-[76px]">
        <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="6" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            style={{ transition: 'stroke-dashoffset 0.9s ease', filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-100">{label}</span>
      </div>
      <div className="text-center text-xs tracking-widest text-slate-400 uppercase">
        {sub}
        <Info text={info} />
      </div>
    </div>
  )
}

function Bar({ label, value, max, color, text, info }: { label: string; value: number; max: number; color: string; text: string; info: string }) {
  const pct = Math.max(2, Math.min(100, (Math.abs(value) / max) * 100))
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-[13px] tracking-wider text-slate-400 uppercase">
        <span>
          {label}
          <Info text={info} />
        </span>
        <span className="text-right font-mono text-slate-200 normal-case">{text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
    </div>
  )
}

type ChartSeries = { values: number[]; stats: Stats; color: string; label: string }

function SeriesChart({ years, series, upto }: { years: number[]; series: ChartSeries[]; upto: number }) {
  const W = 320
  const H = 120
  const pad = 6
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.values).filter(Number.isFinite)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const span = hi - lo || 1
  const lastI = years.indexOf(upto) >= 0 ? years.indexOf(upto) : years.length - 1
  const x = (i: number) => pad + (i / (years.length - 1)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad)
  const zeroY = lo < 0 && hi > 0 ? y(0) : null
  // Sen's line passes through the median point of the years tested.
  const trendLine = (values: number[], perDecade: number | null) => {
    if (perDecade === null) return null
    const used = values.slice(0, lastI + 1)
    const sorted = [...used].sort((a, b) => a - b)
    const midV = sorted[Math.floor(sorted.length / 2)]
    const midI = lastI / 2
    const s = perDecade / 10
    return `${x(0)},${y(midV - s * midI)} ${x(lastI)},${y(midV + s * (lastI - midI))}`
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      role="img"
      aria-label="One dot per year with the trend line"
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect()
        const fx = ((e.clientX - b.left) / b.width) * W
        setHover(Math.max(0, Math.min(years.length - 1, Math.round(((fx - pad) / (W - 2 * pad)) * (years.length - 1)))))
      }}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={H * f} y2={H * f} stroke="rgba(34,211,238,0.08)" />
      ))}
      {lastI < years.length - 1 && <rect x={x(lastI) + 3} y={0} width={W - pad - x(lastI) - 3} height={H} className="cc-future" />}
      {zeroY !== null && (
        <>
          <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="rgba(148,163,184,0.35)" strokeDasharray="1 3" />
          <text x={W - pad} y={zeroY - 3} fill="#64748b" fontSize="8" textAnchor="end">
            usual level
          </text>
        </>
      )}
      <text x={pad} y={9} fill="#64748b" fontSize="8">
        ▲ above usual
      </text>
      <text x={pad} y={H - 1} fill="#64748b" fontSize="8">
        ▼ below usual
      </text>
      {series.map((s, k) => {
        const lowL = k === 0 ? trendLine(s.values, s.stats.ciLow) : null
        const highL = k === 0 ? trendLine(s.values, s.stats.ciHigh) : null
        const senL = trendLine(s.values, s.stats.slopePerDecade)
        const dotColor = k === 0 ? '#22d3ee' : COMPARE_COLOR
        return (
          <g key={s.label}>
            {lowL && <polyline points={lowL} fill="none" stroke={s.color} strokeOpacity="0.35" strokeDasharray="3 3" />}
            {highL && <polyline points={highL} fill="none" stroke={s.color} strokeOpacity="0.35" strokeDasharray="3 3" />}
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={dotColor} strokeWidth="1.3" strokeOpacity="0.6" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={dotColor} opacity={i > lastI ? 0.3 : 1} />
            ))}
            {senL && <polyline points={senL} fill="none" stroke={s.color} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 4px ${s.color})` }} />}
          </g>
        )
      })}
      {hover !== null && (
        <>
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgba(34,211,238,0.4)" />
          <text x={Math.min(W - 92, Math.max(pad, x(hover) + 6))} y={20} className="cc-chart-label" fontSize="10" fontFamily="ui-monospace, monospace">
            {years[hover]}: {series.map((s) => `${s.values[hover] > 0 ? '+' : ''}${fmt(s.values[hover], 2)}`).join(' / ')}
          </text>
        </>
      )}
      <text x={pad} y={H + 10} fill="#64748b" fontSize="9">
        {years[0]}
      </text>
      <text x={W - pad} y={H + 10} fill="#64748b" fontSize="9" textAnchor="end">
        {years.at(-1)}
      </text>
    </svg>
  )
}

// ---------- Globe ----------

const GLOBE_COLORS: Record<Theme, { ocean: [string, string]; glow: string; dot: string; coast: string; grid: string; rim: string; label: string }> = {
  night: { ocean: ['#0b2a3d', '#030b14'], glow: 'rgba(34,211,238,0.28)', dot: 'rgba(52,211,153,0.85)', coast: 'rgba(34,211,238,0.22)', grid: 'rgba(34,211,238,0.10)', rim: 'rgba(34,211,238,0.6)', label: '#e0f2fe' },
  day: { ocean: ['#f8fafc', '#cbd5e1'], glow: 'rgba(8,145,178,0.22)', dot: 'rgba(14,116,144,0.8)', coast: 'rgba(14,116,144,0.3)', grid: 'rgba(14,116,144,0.14)', rim: 'rgba(14,116,144,0.6)', label: '#0f172a' },
}

type GlobeProps = {
  sites: Site[]
  colors: Record<string, string>
  selected: string | null
  compare: string | null
  focus: { lat: number; lon: number; t: number } | null
  spinning: boolean
  theme: Theme
  onPick: (id: string) => void
  onHover: (h: { id: string; x: number; y: number } | null) => void
}

function Globe({ sites, colors, selected, compare, focus, spinning, theme, onPick, onHover }: GlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const rot = useRef<[number, number]>([-40, -20])
  const zoom = useRef(1)
  const drag = useRef<{ x: number; y: number; r: [number, number]; moved: boolean } | null>(null)
  const anim = useRef<{ from: [number, number]; to: [number, number]; t0: number } | null>(null)
  const size = useRef({ w: 600, h: 600 })
  const hover = useRef<string | null>(null)
  const [pointer, setPointer] = useState<[number, number] | null>(null)
  // Latest props for the animation loop, which runs once and must not restart on every change.
  const live = useRef({ sites, colors, selected, compare, spinning, theme })
  useEffect(() => {
    live.current = { sites, colors, selected, compare, spinning, theme }
  }, [sites, colors, selected, compare, spinning, theme])

  useEffect(() => {
    if (focus) anim.current = { from: [...rot.current], to: [-focus.lon, -focus.lat], t0: performance.now() }
  }, [focus])

  const projection = useCallback(() => {
    const { w, h } = size.current
    return geoOrthographic()
      .rotate(rot.current)
      .translate([w / 2, h / 2])
      .scale(Math.min(w, h) * 0.42 * zoom.current)
      .clipAngle(90)
  }, [])

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    const ro = new ResizeObserver(([e]) => {
      const dpr = window.devicePixelRatio || 1
      size.current = { w: e.contentRect.width, h: e.contentRect.height }
      el.width = e.contentRect.width * dpr
      el.height = e.contentRect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    ro.observe(el)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()

    // Target reticle: crosshair lines across the view, corner brackets, name and coordinates.
    const reticle = (x: number, y: number, col: string, label: string, sub: string, now: number) => {
      const { w, h } = size.current
      const C = GLOBE_COLORS[live.current.theme]
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 1
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      const r = 14 + (reduced ? 0 : Math.sin(now / 300) * 1.5)
      const k = 6
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.moveTo(x + sx * r, y + sy * (r - k))
        ctx.lineTo(x + sx * r, y + sy * r)
        ctx.lineTo(x + sx * (r - k), y + sy * r)
      }
      ctx.stroke()
      ctx.font = '600 11px ui-monospace, monospace'
      ctx.fillStyle = C.label
      ctx.fillText(label, x + r + 6, y - 2)
      ctx.font = '10px ui-monospace, monospace'
      ctx.globalAlpha = 0.7
      ctx.fillText(sub, x + r + 6, y + 11)
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      const { sites, colors, selected, compare, spinning, theme } = live.current
      const C = GLOBE_COLORS[theme]
      const dt = Math.min(64, now - last)
      last = now
      if (anim.current) {
        const k = Math.min(1, (now - anim.current.t0) / 1100)
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
        let dl = anim.current.to[0] - anim.current.from[0]
        dl = ((((dl + 180) % 360) + 360) % 360) - 180 // shortest way round
        rot.current = [anim.current.from[0] + dl * e, anim.current.from[1] + (anim.current.to[1] - anim.current.from[1]) * e]
        if (k >= 1) anim.current = null
      } else if (spinning && !drag.current && !reduced) {
        rot.current = [rot.current[0] + dt * 0.006, rot.current[1]]
      }

      const { w, h } = size.current
      const proj = projection()
      const r = proj.scale()
      const path = geoPath(proj, ctx)
      const cx = w / 2
      const cy = h / 2
      ctx.clearRect(0, 0, w, h)

      // Atmosphere glow, then the ocean sphere.
      const glow = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.25)
      glow.addColorStop(0, C.glow)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, r * 1.25, 0, 2 * Math.PI)
      ctx.fill()
      const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
      ocean.addColorStop(0, C.ocean[0])
      ocean.addColorStop(1, C.ocean[1])
      ctx.fillStyle = ocean
      ctx.beginPath()
      path({ type: 'Sphere' })
      ctx.fill()

      ctx.beginPath()
      path(GRATICULE)
      ctx.strokeStyle = C.grid
      ctx.lineWidth = 0.6
      ctx.stroke()
      ctx.beginPath()
      path(COAST)
      ctx.strokeStyle = C.coast
      ctx.lineWidth = 0.7
      ctx.stroke()

      // Hologram point cloud: dots fade towards the limb.
      const centre: [number, number] = [-rot.current[0], -rot.current[1]]
      ctx.fillStyle = C.dot
      const dotR = Math.max(1.2, 1.6 * zoom.current)
      for (const d of getLandDots()) {
        const dist = geoDistance(d, centre)
        if (dist > Math.PI / 2) continue
        const p = proj(d)
        if (!p) continue
        ctx.globalAlpha = 0.25 + 0.75 * Math.cos(dist)
        ctx.fillRect(p[0] - dotR / 2, p[1] - dotR / 2, dotR, dotR)
      }
      ctx.globalAlpha = 1

      ctx.beginPath()
      path({ type: 'Sphere' })
      ctx.strokeStyle = C.rim
      ctx.lineWidth = 1.2
      ctx.stroke()

      // Region boxes for the selected and compared sites, and the arc between them.
      const sel = sites.find((s) => s.id === selected)
      const cmp = sites.find((s) => s.id === compare)
      const boxes: [Site | undefined, string][] = [
        [sel, colors[sel?.id ?? ''] ?? '#22d3ee'],
        [cmp, COMPARE_COLOR],
      ]
      for (const [s, col] of boxes) {
        if (!s || s.id === 'glb') continue
        ctx.beginPath()
        path(boxOutline(s.bbox))
        ctx.strokeStyle = col
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.shadowColor = col
        ctx.shadowBlur = 10
        ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
      }
      if (sel && cmp && sel.id !== 'glb' && cmp.id !== 'glb') {
        ctx.beginPath()
        path({
          type: 'LineString',
          coordinates: [
            [sel.lon, sel.lat],
            [cmp.lon, cmp.lat],
          ],
        })
        ctx.strokeStyle = COMPARE_COLOR
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        ctx.lineDashOffset = reduced ? 0 : -now / 40
        ctx.shadowColor = COMPARE_COLOR
        ctx.shadowBlur = 12
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineDashOffset = 0
        ctx.shadowBlur = 0
      }

      // Site markers: pulsing rings coloured by the verdict; reticles on selected, compared and hovered sites.
      for (const s of sites) {
        if (s.id === 'glb' || geoDistance([s.lon, s.lat], centre) > Math.PI / 2 - 0.05) continue
        const p = proj([s.lon, s.lat])
        if (!p) continue
        const col = s.id === compare ? COMPARE_COLOR : (colors[s.id] ?? '#22d3ee')
        const pulse = reduced ? 0.5 : (now / 1600 + s.lat * 0.01) % 1
        ctx.beginPath()
        ctx.arc(p[0], p[1], 5 + pulse * 16, 0, 2 * Math.PI)
        ctx.strokeStyle = col
        ctx.globalAlpha = 0.6 * (1 - pulse)
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(p[0], p[1], s.id === selected || s.id === hover.current ? 6.5 : 4.5, 0, 2 * Math.PI)
        ctx.fillStyle = col
        ctx.shadowColor = col
        ctx.shadowBlur = 14
        ctx.fill()
        ctx.shadowBlur = 0
        if (s.id === selected || s.id === compare || s.id === hover.current) {
          reticle(p[0], p[1], col, s.name.toUpperCase(), `${fmtLat(s.lat)} ${fmtLon(s.lon)}`, now)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [projection])

  const siteAt = (px: number, py: number) => {
    const proj = projection()
    const centre: [number, number] = [-rot.current[0], -rot.current[1]]
    let best: string | null = null
    let bestD = 16
    for (const s of live.current.sites) {
      if (s.id === 'glb' || geoDistance([s.lon, s.lat], centre) > Math.PI / 2) continue
      const p = proj([s.lon, s.lat])
      if (!p) continue
      const d = Math.hypot(p[0] - px, p[1] - py)
      if (d < bestD) {
        bestD = d
        best = s.id
      }
    }
    return best
  }

  const local = (e: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect()
    return [e.clientX - b.left, e.clientY - b.top] as const
  }
  const setZoom = (z: number) => {
    zoom.current = Math.max(0.7, Math.min(3, z))
  }

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvas}
        className="h-full w-full cursor-grab touch-none"
        aria-label="Globe of investigation sites. Drag to rotate, scroll or use + and − to zoom. Sites are also listed in the side panel."
        onWheel={(e) => setZoom(zoom.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, r: [...rot.current], moved: false }
          anim.current = null
          canvas.current!.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const [px, py] = local(e)
          const id = drag.current ? null : siteAt(px, py)
          if (id !== hover.current) onHover(id ? { id, x: px, y: py } : null)
          hover.current = id
          const ll = projection().invert?.([px, py])
          setPointer(ll && geoDistance(ll, [-rot.current[0], -rot.current[1]]) <= Math.PI / 2 ? [ll[1], ll[0]] : null)
          canvas.current!.style.cursor = drag.current ? 'grabbing' : id ? 'pointer' : 'grab'
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true
          const k = 0.3 / zoom.current
          rot.current = [drag.current.r[0] + dx * k, Math.max(-80, Math.min(80, drag.current.r[1] - dy * k))]
        }}
        onPointerLeave={() => {
          hover.current = null
          onHover(null)
          setPointer(null)
        }}
        onPointerUp={(e) => {
          const wasDrag = drag.current?.moved
          drag.current = null
          if (!wasDrag) {
            const [px, py] = local(e)
            const id = siteAt(px, py)
            if (id) onPick(id)
          }
        }}
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 flex-col gap-1">
        <button onClick={() => setZoom(zoom.current * 1.25)} className="cc-glass rounded-md p-1.5 text-cyan-300 hover:text-cyan-100" aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => setZoom(zoom.current / 1.25)} className="cc-glass rounded-md p-1.5 text-cyan-300 hover:text-cyan-100" aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
      </div>
      {pointer && (
        <div className="cc-glass pointer-events-none absolute right-3 bottom-14 rounded-md px-2 py-1 font-mono text-xs text-cyan-200">
          <Crosshair className="mr-1 inline h-3 w-3" />
          {fmtLat(pointer[0])} {fmtLon(pointer[1])}
        </div>
      )}
    </div>
  )
}

// ---------- Main ----------

type Stage = 'idle' | 'running' | 'done'

export default function CommandCenter() {
  const initial = useMemo(() => readUrl(), [])
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [regions, setRegions] = useState<Record<string, RegionsFile>>({})
  const [checks, setChecks] = useState<Check[]>([])
  const [varId, setVarId] = useState(initial.v ?? 'aod')
  const [siteId, setSiteId] = useState<string | null>(SITES.some((s) => s.id === initial.s) ? initial.s! : null)
  const [compareId, setCompareId] = useState<string | null>(SITES.some((s) => s.id === initial.c) ? initial.c! : null)
  const [upto, setUpto] = useState<number | null>(initial.y ?? null)
  const [theme, setTheme] = useState<Theme>(initial.t ?? 'night')
  const [focus, setFocus] = useState<{ lat: number; lon: number; t: number } | null>(() => {
    const s = SITES.find((x) => x.id === initial.s)
    return s && s.id !== 'glb' ? { lat: s.lat, lon: s.lon, t: 0 } : null
  })
  const [hoverCard, setHoverCard] = useState<{ id: string; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [biome, setBiome] = useState<Biome | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = useState<Verdict | 'all'>('all')
  const [spinning, setSpinning] = useState(!initial.s)
  // A shared link opens straight on the verdict.
  const [stage, setStage] = useState<Stage>(initial.s ? 'done' : 'idle')
  const [step, setStep] = useState(initial.s ? STAGES.length : 0)
  const [now, setNow] = useState(() => new Date())
  const [guide, setGuide] = useState(false)
  const [interest, setInterest] = useState<(typeof INTERESTS)[number]['id'] | null>(null)
  const [place, setPlace] = useState<Biome | null>(null)
  const [demo, setDemo] = useState<{ i: number; step: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    fetch(dataUrl('manifest.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}. Run pipeline/scripts/make_mock.py first.`)
        return r.json() as Promise<Manifest>
      })
      .then(async (m) => {
        setManifest(m)
        setVarId((v) => (m.variables.some((x) => x.id === v) ? v : m.variables[0].id))
        const files = await Promise.all(m.variables.map((v) => fetch(dataUrl(v.regions)).then((r) => r.json() as Promise<RegionsFile>)))
        setRegions(Object.fromEntries(files.map((f) => [f.variable, f])))
        const val = await fetch(dataUrl(m.files.validation)).then((r) => r.json())
        setChecks(val.checks ?? [])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // Keep the shareable link in the address bar up to date (replaceState: no history spam, no hashchange).
  useEffect(() => {
    const q = new URLSearchParams()
    q.set('v', varId)
    if (siteId) q.set('s', siteId)
    if (compareId) q.set('c', compareId)
    if (upto) q.set('y', String(upto))
    if (theme === 'day') q.set('t', 'day')
    window.history.replaceState(null, '', `#/?${q.toString()}`)
  }, [varId, siteId, compareId, upto, theme])

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const years = useMemo(() => regions[varId]?.years ?? [], [regions, varId])
  const lastYear = years.at(-1) ?? 2025
  const uptoYear = upto && upto < lastYear ? upto : lastYear
  const truncated = uptoYear < lastYear

  const series = useCallback((vid: string, sid: string): RegionSeries | undefined => regions[vid]?.regions.find((r) => r.id === sid)?.seasons.ANN, [regions])

  // Stats for the years in view: the pipeline's corrected test for the full record, a quick re-test otherwise.
  const statsFor = useCallback(
    (vid: string, sid: string): Stats | undefined => {
      const s = series(vid, sid)
      if (!s) return undefined
      if (!truncated) return s.stats
      const ys = regions[vid].years
      const keep = ys.map((y) => y <= uptoYear)
      const q = quickTrend(
        s.values.filter((_, i) => keep[i]),
        ys.filter((_, i) => keep[i]),
      )
      return q ? { ...q, ciLow: null, ciHigh: null, relChange: null } : undefined
    },
    [series, regions, truncated, uptoYear],
  )

  // Rise-then-fall check on the selected site's yearly series (years in view only).
  const twist = useMemo(() => {
    const s = siteId ? series(varId, siteId) : undefined
    if (!s) return null
    const keep = years.map((y) => y <= uptoYear)
    return turningPoint(
      s.values.filter((_, i) => keep[i]),
      years.filter((_, i) => keep[i]),
    )
  }, [series, varId, siteId, years, uptoYear])

  const colors = useMemo(() => Object.fromEntries(SITES.map((s) => [s.id, VERDICT_COLOR[verdictOf(statsFor(varId, s.id))]])), [statsFor, varId])

  const visible = SITES.filter(
    (s) =>
      (biome === 'all' || s.biome === biome) &&
      s.name.toLowerCase().includes(query.toLowerCase()) &&
      (verdictFilter === 'all' || verdictOf(statsFor(varId, s.id)) === verdictFilter),
  )

  // Escape closes the guide first, then the comparison, then the case file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (guide) setGuide(false)
      else if (compareId) setCompareId(null)
      else if (siteId) {
        setSiteId(null)
        setSpinning(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guide, compareId, siteId])

  const select = useCallback((id: string) => {
    const s = SITES.find((x) => x.id === id)!
    setSiteId(id)
    setCompareId((c) => (c === id ? null : c))
    setStage('idle')
    setStep(0)
    setSpinning(false)
    if (id !== 'glb') setFocus({ lat: s.lat, lon: s.lon, t: Date.now() })
  }, [])

  // Swing the camera to the midpoint of the two sites so both are in view.
  const chooseCompare = (id: string | null) => {
    setCompareId(id)
    const a = SITES.find((x) => x.id === siteId)
    const b = SITES.find((x) => x.id === id)
    if (a && b && a.id !== 'glb' && b.id !== 'glb') {
      const [lon, lat] = geoInterpolate([a.lon, a.lat], [b.lon, b.lat])(0.5)
      setFocus({ lat, lon, t: Date.now() })
    }
  }

  const runDiagnostic = useCallback(() => {
    setStage('running')
    setStep(0)
    STAGES.forEach((_, i) => timers.current.push(window.setTimeout(() => setStep(i + 1), 420 * (i + 1))))
    timers.current.push(window.setTimeout(() => setStage('done'), 420 * (STAGES.length + 1)))
  }, [])

  // Demo playback: select, fly, run the test, pause on the verdict, then move to the next step.
  const playDemo = useCallback(
    function play(i: number, stepIndex: number) {
      const d = DEMOS[i]
      const s = d.steps[stepIndex]
      clearTimers()
      setDemo({ i, step: stepIndex })
      setCompareId(null)
      setUpto(null)
      setVarId(s.varId)
      select(s.siteId)
      timers.current.push(window.setTimeout(runDiagnostic, 1400))
      if (stepIndex + 1 < d.steps.length) timers.current.push(window.setTimeout(() => play(i, stepIndex + 1), 9000))
    },
    [select, runDiagnostic],
  )

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  const site = SITES.find((s) => s.id === siteId) ?? null
  const cmpSite = SITES.find((s) => s.id === compareId) ?? null
  const cur = site ? series(varId, site.id) : undefined
  const curStats = site ? statsFor(varId, site.id) : undefined
  const cmp = cmpSite ? series(varId, cmpSite.id) : undefined
  const cmpStats = cmpSite ? statsFor(varId, cmpSite.id) : undefined
  const verdict = verdictOf(curStats)
  const def = DEFINITIONS[varId]
  const passed = checks.filter((c) => c.status === 'pass').length
  const hoverSite = hoverCard ? SITES.find((s) => s.id === hoverCard.id) : undefined
  const hoverStats = hoverSite ? statsFor(varId, hoverSite.id) : undefined
  const leads = LEADS.filter(
    (l) =>
      (!interest || (INTERESTS.find((i) => i.id === interest)!.vars as readonly string[]).includes(l.varId)) &&
      (!place || SITES.find((s) => s.id === l.siteId)?.biome === place),
  )

  if (error) return <div className="cc-grid flex h-screen items-center justify-center p-6 font-mono text-rose-300">{error}</div>
  const variable = manifest?.variables.find((v) => v.id === varId)
  if (!manifest || !variable) return <div className="cc-grid flex h-screen items-center justify-center font-mono tracking-[0.3em] text-cyan-300">INITIALISING…</div>
  const short = def?.short ?? variable.label

  return (
    <div data-theme={theme} className="cc-grid relative flex h-screen flex-col overflow-hidden font-sans text-slate-200">
      <div className="cc-scan pointer-events-none absolute inset-x-0 top-0 z-0 h-24 bg-gradient-to-b from-transparent via-cyan-400/5 to-transparent" />

      {/* Header telemetry */}
      <header className="cc-glass relative z-10 m-3 mb-0 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-cyan-300" />
          <h1 className="cc-glow text-sm font-bold tracking-[0.25em] text-cyan-200">TREND DETECTIVE</h1>
          <span className="hidden text-xs tracking-[0.2em] text-slate-500 sm:inline">// EARTH CHANGE COMMAND</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[13px] text-slate-400 max-md:hidden">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            {now.toISOString().slice(0, 19).replace('T', ' ')} UTC
          </span>
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-cyan-400" />
            DATA {manifest.window.start.slice(0, 4)}–{manifest.window.end.slice(0, 4)}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            {manifest.variables.length} CLUES · {SITES.length} PLACES
          </span>
          <a href="#/checks" className="flex items-center gap-1.5 hover:text-cyan-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {passed} OF {checks.length} CHECKS PASSED
          </a>
          <span className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${manifest.mock ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${manifest.mock ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {manifest.mock ? 'MOCK FEED' : 'NASA DATA'}
          </span>
        </div>
        <nav className="ml-auto flex gap-2">
          <button
            onClick={() => setTheme((t) => (t === 'night' ? 'day' : 'night'))}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-2.5 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-400/10"
            aria-label={theme === 'night' ? 'Switch to daylight theme' : 'Switch to night theme'}
          >
            {theme === 'night' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="max-sm:hidden">{theme === 'night' ? 'Daylight' : 'Orbit night'}</span>
          </button>
          <button
            onClick={() => setGuide(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
          >
            <Compass className="h-3.5 w-3.5" /> Start investigating
          </button>
          <a href="#/map" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-400/10">
            <MapIcon className="h-3.5 w-3.5" /> <span className="max-sm:hidden">Trend map</span>
          </a>
          <a href="#/methods" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-400/10">
            <HelpCircle className="h-3.5 w-3.5" /> <span className="max-sm:hidden">How it works</span>
          </a>
        </nav>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 gap-3 p-3">
        {/* Left rail: variable, filters, sites, demos */}
        <aside className="cc-glass flex w-80 shrink-0 flex-col gap-6 overflow-y-auto rounded-xl p-5 max-lg:hidden 2xl:w-96">
          <section>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-cyan-400">STEP 1 · CHOOSE A CLUE</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">A clue is something NASA satellites measure every month. Pick one to see where on Earth it is changing.</p>
            <div className="mt-3 space-y-3">
              {INTERESTS.map((g) => {
                const vars = manifest.variables.filter((v) => (g.vars as readonly string[]).includes(v.id))
                if (!vars.length) return null
                return (
                  <div key={g.id}>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">{g.label}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {vars.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setVarId(v.id)
                            setStage('idle')
                          }}
                          aria-pressed={v.id === varId}
                          className={`rounded-lg border px-2.5 py-2 text-left text-sm transition ${v.id === varId ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.25)]' : 'border-slate-700/70 text-slate-300 hover:border-cyan-400/40 hover:text-slate-100'}`}
                        >
                          {DEFINITIONS[v.id]?.short ?? v.label}
                          {v.caution && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-400" aria-label="read the caution" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 rounded-lg border border-cyan-400/20 bg-slate-950/40 p-3">
              <p className="text-sm font-semibold text-cyan-100">
                <HelpCircle className="mr-1.5 inline h-4 w-4 text-cyan-400" />
                What is “{short.toLowerCase()}”?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{def?.plain ?? variable.label}</p>
              {def && <p className="mt-1.5 text-xs text-slate-500">Measured by: {def.source}</p>}
            </div>
            {variable.caution && (
              <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-100">
                <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-400" />
                <strong className="font-semibold">Be careful:</strong> {variable.caution}
              </p>
            )}
          </section>

          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.15em] text-cyan-400">
              <Filter className="h-3.5 w-3.5" /> STEP 2 · CHOOSE A PLACE
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">Click a place to open its case file, or click a glowing dot on the globe.</p>
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, e.g. Amazon or Delhi"
                aria-label="Search places"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
            </label>
            <p className="mt-3 text-xs font-medium text-slate-500">What kind of place?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(['all', ...new Set(SITES.map((s) => s.biome))] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBiome(b)}
                  aria-pressed={biome === b}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${biome === b ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {b === 'all' ? 'Everywhere' : (PLACE_LABEL[b] ?? b)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">Show places where {short.toLowerCase()} is…</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(['all', 'rising', 'falling', 'noise'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVerdictFilter(v)}
                  aria-pressed={verdictFilter === v}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${verdictFilter === v ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {v !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v] }} />}
                  {v === 'all' ? 'Anything' : v === 'noise' ? 'Not proven yet' : `Really ${v}`}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-cyan-400">PLACES TO INVESTIGATE · {visible.length}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              The dot shows what our test found for {short.toLowerCase()}: <span style={{ color: VERDICT_COLOR.rising }}>rising</span>,{' '}
              <span style={{ color: VERDICT_COLOR.falling }}>falling</span> or <span className="text-slate-300">not proven</span> (could just be natural ups and downs).
            </p>
            <ul className="mt-2 space-y-1">
              {visible.map((s) => {
                const v = verdictOf(statsFor(varId, s.id))
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => select(s.id)}
                      className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${s.id === siteId ? 'border-cyan-300/60 bg-cyan-400/10' : 'border-transparent hover:border-cyan-400/25 hover:bg-cyan-400/5'}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: VERDICT_COLOR[v], boxShadow: `0 0 8px ${VERDICT_COLOR[v]}` }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-100">{s.name}</span>
                        <span className="block text-xs text-slate-500">
                          {PLACE_LABEL[s.biome] ?? s.biome} · {VERDICT_TEXT[v]}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                    </button>
                  </li>
                )
              })}
              {!visible.length && <li className="text-sm text-slate-500">No places match. Try “Everywhere” and “Anything”.</li>}
            </ul>
          </section>

          <section>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-cyan-400">GUIDED STORIES</h2>
            <p className="mt-1 mb-2 text-xs leading-relaxed text-slate-500">New here? Press play and the app walks you through a real case, step by step.</p>
            {DEMOS.map((d, i) => (
              <button
                key={d.title}
                onClick={() => playDemo(i, 0)}
                className="mb-2 flex w-full items-start gap-2.5 rounded-lg border border-slate-700/70 p-3 text-left transition hover:border-emerald-400/50 hover:bg-emerald-400/5"
              >
                <Play className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <span className="block text-sm text-slate-100">{d.title}</span>
                  <span className="block text-xs leading-relaxed text-slate-400">{d.blurb}</span>
                </span>
              </button>
            ))}
          </section>
        </aside>

        {/* Center stage: globe */}
        <section className="relative min-w-0 flex-1">
          <Globe sites={SITES} colors={colors} selected={siteId} compare={compareId} focus={focus} spinning={spinning} theme={theme} onPick={select} onHover={setHoverCard} />

          {/* Hover card: headline stats before opening the case file */}
          {hoverSite && hoverCard && (
            <div className="cc-glass cc-rise pointer-events-none absolute z-20 w-56 rounded-lg p-3" style={{ left: hoverCard.x + 18, top: hoverCard.y + 18 }}>
              <p className="text-xs tracking-[0.2em] text-cyan-400">{hoverSite.biome.toUpperCase()}</p>
              <p className="text-sm font-semibold text-slate-100">{hoverSite.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[verdictOf(hoverStats)] }} />
                {short}: {VERDICT_TEXT[verdictOf(hoverStats)].toLowerCase()}
                {hoverStats?.slopePerDecade != null && (
                  <span className="font-mono text-slate-400">
                    ({hoverStats.slopePerDecade > 0 ? '+' : ''}
                    {fmt(hoverStats.slopePerDecade, 2)} per 10 yr)
                  </span>
                )}
              </p>
              <p className="mt-1 text-[13px] text-slate-400">{hoverSite.story.takeaway.split('. ')[0]}.</p>
              <p className="mt-1.5 text-xs text-cyan-300">Click to open the case file</p>
            </div>
          )}

          {/* Time machine: re-test on the data up to a chosen year */}
          <div className="cc-glass absolute bottom-3 left-1/2 w-[min(420px,calc(100%-120px))] -translate-x-1/2 rounded-lg px-3 py-2 max-lg:bottom-14 max-lg:w-[calc(100%-24px)]">
            <div className="flex items-center justify-between text-xs tracking-wider text-slate-400">
              <span>
                TIME MACHINE · DATA UP TO <span className="font-mono text-cyan-200">{uptoYear}</span>
                <Info text={EXPLAIN.timeline} />
              </span>
              {truncated && (
                <button onClick={() => setUpto(null)} className="text-cyan-300 hover:text-cyan-100">
                  reset to {lastYear}
                </button>
              )}
            </div>
            <input
              type="range"
              min={(years[0] ?? 2003) + 6}
              max={lastYear}
              value={uptoYear}
              onChange={(e) => setUpto(Number(e.target.value) >= lastYear ? null : Number(e.target.value))}
              className="mt-1 w-full accent-cyan-400"
              aria-label="Use data up to this year"
            />
          </div>

          <div className="cc-glass absolute top-3 left-3 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs tracking-wider text-slate-400 max-xl:hidden">
            {(['rising', 'falling', 'noise'] as const).map((v) => (
              <span key={v} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v], boxShadow: `0 0 6px ${VERDICT_COLOR[v]}` }} />
                {VERDICT_TEXT[v].toUpperCase()}
              </span>
            ))}
            <span className="text-slate-500">REAL = UNDER 1-IN-20 CHANCE OF LUCK</span>
          </div>
          <button
            onClick={() => setSpinning((s) => !s)}
            className="cc-glass absolute right-3 bottom-3 rounded-lg p-2 text-cyan-300 transition hover:text-cyan-100"
            aria-label={spinning ? 'Pause rotation' : 'Resume rotation'}
          >
            {spinning ? <Pause className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
          </button>

          {!site && !demo && (
            <div className="cc-glass cc-rise absolute top-3 right-3 max-h-[calc(100%-5.5rem)] w-80 overflow-y-auto rounded-xl p-5 max-lg:hidden 2xl:w-96">
              <p className="text-xs font-semibold tracking-[0.15em] text-cyan-400">YOUR MISSION</p>
              <p className="mt-1 text-lg leading-snug font-semibold text-slate-50">Is {short.toLowerCase()} really changing, and where?</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">Nature goes up and down all the time. Your job is to find changes that are real, not just luck.</p>
              <ol className="mt-4 space-y-3">
                {DETECTIVE_STEPS.map((d) => (
                  <li key={d.n} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/50 font-mono text-sm text-cyan-200">{d.n}</span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-100">{d.title}</span>
                      <span className="block text-sm leading-relaxed text-slate-400">{d.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-slate-300">
                So far, for {short.toLowerCase()}, out of {SITES.length} places:
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {(['rising', 'falling', 'noise'] as const).map((v) => (
                  <div key={v} className="rounded-lg border border-slate-700/60 bg-slate-950/40 py-2">
                    <div className="text-2xl font-semibold" style={{ color: VERDICT_COLOR[v] }}>
                      {SITES.filter((s) => verdictOf(statsFor(varId, s.id)) === v).length}
                    </div>
                    <div className="text-xs text-slate-400">{v === 'noise' ? 'Not proven yet' : `Really ${v}`}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => playDemo(0, 0)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Play className="h-4 w-4" /> New here? Watch “{DEMOS[0].title}”
              </button>
            </div>
          )}

          {/* Site picker for small screens, where the left rail is hidden */}
          <div className="absolute inset-x-3 top-3 flex gap-2 overflow-x-auto lg:hidden">
            {SITES.map((s) => (
              <button key={s.id} onClick={() => select(s.id)} className="cc-glass shrink-0 rounded-full px-3 py-1 text-xs">
                {s.name}
              </button>
            ))}
          </div>

          {demo && (
            <div className="cc-glass cc-rise absolute inset-x-3 top-3 mx-auto flex max-w-xl items-start gap-3 rounded-xl p-3 max-lg:top-14">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p className="flex-1 text-sm text-slate-100">{DEMOS[demo.i].steps[demo.step].caption}</p>
              {demo.step + 1 < DEMOS[demo.i].steps.length && (
                <button onClick={() => playDemo(demo.i, demo.step + 1)} className="text-xs text-cyan-300 hover:text-cyan-100">
                  Next
                </button>
              )}
              <button
                onClick={() => {
                  clearTimers()
                  setDemo(null)
                }}
                aria-label="End demo"
              >
                <X className="h-4 w-4 text-slate-400 hover:text-slate-100" />
              </button>
            </div>
          )}
        </section>

        {/* Right rail: case file */}
        {site && (
          <aside
            key={site.id + varId}
            className="cc-glass cc-slide absolute top-3 right-3 bottom-3 z-20 flex w-[min(440px,calc(100%-24px))] flex-col overflow-y-auto rounded-xl p-4 lg:static lg:w-[420px] 2xl:w-[460px] lg:shrink-0"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs tracking-[0.2em] text-cyan-400">CASE FILE · {site.biome.toUpperCase()}</p>
                <h2 className="cc-glow mt-0.5 text-lg leading-snug font-semibold text-cyan-50">{site.story.headline}</h2>
                <p className="mt-0.5 font-mono text-[13px] text-slate-500">
                  <Crosshair className="mr-1 inline h-3 w-3" />
                  {site.name} · {fmtLat(site.lat)} {fmtLon(site.lon)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={share} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200" aria-label="Copy a link to this finding" title="Copy a link to this finding">
                  {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Link2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    setSiteId(null)
                    setCompareId(null)
                    setSpinning(true)
                  }}
                  className="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                  aria-label="Close case file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-slate-200">{site.story.takeaway}</p>

            <details className="mt-3 rounded-lg border border-cyan-400/15 bg-slate-950/30 p-3">
              <summary className="cursor-pointer text-xs font-semibold tracking-[0.2em] text-cyan-400 select-none">BACKGROUND FILE · WHAT SCIENTISTS KNOW</summary>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">
                {site.story.facts.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-3">
              <p className="text-xs font-semibold tracking-[0.2em] text-emerald-300">WHY SHOULD YOU CARE?</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{site.story.why}</p>
            </div>

            <label className="mt-4 flex items-center gap-2 text-[13px] text-slate-400">
              <GitCompare className="h-3.5 w-3.5 text-amber-300" />
              Compare with
              <select
                value={compareId ?? ''}
                onChange={(e) => chooseCompare(e.target.value || null)}
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-300"
              >
                <option value="">nobody</option>
                {SITES.filter((s) => s.id !== site.id).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Info text={EXPLAIN.compare} />
            </label>

            {cur && curStats && curStats.slopePerDecade !== null ? (
              <>
                <div className="mt-3 rounded-lg border border-cyan-400/15 bg-slate-950/40 p-3 pb-4">
                  <div className="mb-1 flex flex-wrap justify-between gap-1 text-xs tracking-wider text-slate-400">
                    <span>
                      3 · THE EVIDENCE: {short.toUpperCase()} EACH YEAR VS. NORMAL
                      <Info text={EXPLAIN.chart} />
                    </span>
                    {cmpSite && (
                      <span className="flex items-center gap-2 normal-case">
                        <span className="text-cyan-300">● {site.name}</span>
                        <span style={{ color: COMPARE_COLOR }}>● {cmpSite.name}</span>
                      </span>
                    )}
                  </div>
                  <SeriesChart
                    years={years}
                    upto={uptoYear}
                    series={[
                      { values: cur.values, stats: curStats, color: VERDICT_COLOR[verdict], label: site.id },
                      ...(cmp && cmpStats && cmpSite ? [{ values: cmp.values, stats: cmpStats, color: COMPARE_COLOR, label: cmpSite.id }] : []),
                    ]}
                  />
                  <p className="mt-3 text-xs text-slate-500">Dots: one per year · Bright line: the trend · Dashed: how steep it could plausibly be</p>
                </div>

                {twist && (
                  <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-amber-200">
                      PLOT TWIST: THE TREND CHANGED DIRECTION AROUND {twist.year}
                      <Info text="One straight line over the whole record can hide a rise followed by a fall. Here two lines, split at the turning year, fit much better than one. The split year is found by searching, so treat these p-values as a rough guide." />
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[13px]">
                      {[
                        { label: `${years[0]}–${twist.year}`, t: twist.before },
                        { label: `${twist.year + 1}–${uptoYear}`, t: twist.after },
                      ].map(({ label, t }) => (
                        <div key={label} className="rounded border border-amber-300/20 p-2">
                          <p className="text-slate-400">{label}</p>
                          <p className={t.slopePerDecade > 0 ? 'text-rose-300' : 'text-sky-300'}>
                            {t.slopePerDecade > 0 ? '▲ rising +' : '▼ falling '}
                            {fmt(t.slopePerDecade, 2)} per 10 yr
                          </p>
                          <p className="text-slate-500">p {fmtP(t.p)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[13px] text-slate-300">
                      This is why the whole-record verdict can say “not proven” even when the change is obvious: in a single straight line, the rise and the fall cancel out.
                    </p>
                  </div>
                )}

                {cmpSite && cmpStats && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { s: site, st: curStats, col: VERDICT_COLOR[verdict] },
                      { s: cmpSite, st: cmpStats, col: COMPARE_COLOR },
                    ].map(({ s, st, col }) => (
                      <div key={s.id} className="rounded-lg border p-2.5" style={{ borderColor: `${col}55` }}>
                        <p className="truncate text-xs font-semibold" style={{ color: col }}>
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-100">{VERDICT_TEXT[verdictOf(st)]}</p>
                        <p className="font-mono text-[13px] text-slate-400">
                          {st.slopePerDecade !== null && st.slopePerDecade > 0 ? '+' : ''}
                          {fmt(st.slopePerDecade, 2)} per 10 yr
                        </p>
                        <p className="font-mono text-[13px] text-slate-500">p {fmtP(st.p)}</p>
                      </div>
                    ))}
                    <p className="col-span-2 text-[13px] text-slate-400">
                      {verdictOf(curStats) === verdictOf(cmpStats)
                        ? `Same verdict in both places: ${VERDICT_TEXT[verdictOf(curStats)].toLowerCase()}.`
                        : `Different stories: ${site.name} is ${VERDICT_TEXT[verdictOf(curStats)].toLowerCase()}, ${cmpSite.name} is ${VERDICT_TEXT[verdictOf(cmpStats)].toLowerCase()}. Same satellites, same years.`}
                    </p>
                  </div>
                )}

                <button
                  onClick={runDiagnostic}
                  disabled={stage === 'running'}
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-cyan-300/50 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 py-2.5 text-sm font-semibold tracking-wider text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition hover:from-cyan-500/30 hover:to-emerald-500/30 disabled:opacity-70"
                >
                  {stage === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {stage === 'running' ? 'RUNNING TREND TEST…' : stage === 'done' ? 'RUN AGAIN' : `4 · TEST IT${truncated ? ` (UP TO ${uptoYear})` : ''}`}
                </button>

                {stage !== 'idle' && (
                  <ol className="mt-3 space-y-1 font-mono text-[13px]" aria-live="polite">
                    {STAGES.map((s, i) => (
                      <li key={s} className={`flex items-center gap-2 transition ${i < step ? 'text-emerald-300' : i === step && stage === 'running' ? 'text-cyan-200' : 'text-slate-600'}`}>
                        {i < step ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : i === step && stage === 'running' ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <span className="h-3 w-3 shrink-0" />}
                        {s}
                      </li>
                    ))}
                  </ol>
                )}

                {stage === 'done' && (
                  <div className="cc-rise mt-4 space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: `${VERDICT_COLOR[verdict]}66`, background: `${VERDICT_COLOR[verdict]}14` }}>
                      {verdict === 'noise' ? <XCircle className="h-5 w-5 shrink-0 text-slate-300" /> : <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: VERDICT_COLOR[verdict] }} />}
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {verdict === 'noise' ? 'Case not proven: this could just be natural ups and downs' : `Case closed: ${short.toLowerCase()} here is really ${verdict}`}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-300">
                          {verdict === 'noise'
                            ? `If nothing were really changing, a pattern like this would still turn up more than 1 time in 20 (p ${fmtP(curStats.p)}). Not enough evidence yet.`
                            : `If nothing were really changing, a trend this strong would turn up less than 1 time in 20 (p ${fmtP(curStats.p)}). From ${years[0]} to ${uptoYear} it ${verdict === 'rising' ? 'went up' : 'went down'} by about ${fmt(Math.abs(curStats.totalChange ?? 0), 2)}${curStats.relChange != null ? ` (${Math.abs(100 * curStats.relChange).toFixed(0)}%)` : ''}.`}
                        </p>
                        {truncated && (
                          <p className="mt-1 text-[13px] text-amber-200">
                            Time machine on: a quick re-test on {curStats.n} years, without the correction for year-to-year memory, so treat it as a rough guide.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-around">
                      <Ring
                        value={curStats.p === null ? 0 : 1 - curStats.p}
                        label={curStats.p === null ? '–' : `${Math.floor(100 * (1 - curStats.p))}%`}
                        sub="Not luck (1 − p)"
                        color={VERDICT_COLOR[verdict]}
                        info={EXPLAIN.p}
                      />
                      <Ring value={Math.min(1, Math.abs(curStats.snr ?? 0) / 2)} label={fmt(curStats.snr, 2)} sub="Trend vs. wobble" color="#22d3ee" info={EXPLAIN.snr} />
                      <Ring value={years.length ? curStats.n / years.length : 0} label={`${curStats.n}`} sub="Years used" color="#34d399" info={EXPLAIN.years} />
                    </div>

                    <div className="space-y-3">
                      <Bar
                        label="Speed of change"
                        info={EXPLAIN.rate}
                        value={curStats.slopePerDecade ?? 0}
                        max={Math.max(Math.abs(curStats.ciLow ?? 0), Math.abs(curStats.ciHigh ?? 0), Math.abs(curStats.slopePerDecade ?? 0), 1e-9)}
                        color={VERDICT_COLOR[verdict]}
                        text={`${(curStats.slopePerDecade ?? 0) > 0 ? '+' : ''}${fmt(curStats.slopePerDecade)} ${perDecade(variable.trendUnits)}`}
                      />
                      {curStats.ciLow !== null && (
                        <Bar label="Likely range" info={EXPLAIN.range} value={1} max={1} color="rgba(34,211,238,0.5)" text={`${fmt(curStats.ciLow)} to ${fmt(curStats.ciHigh)}`} />
                      )}
                      <Bar
                        label={`Total change ${years[0]}–${uptoYear}`}
                        info={EXPLAIN.total}
                        value={Math.abs(curStats.slopePerDecade ?? 0)}
                        max={Math.max(Math.abs(curStats.ciLow ?? 0), Math.abs(curStats.ciHigh ?? 0), Math.abs(curStats.slopePerDecade ?? 0), 1e-9)}
                        color="#34d399"
                        text={`${fmt(curStats.totalChange)}${curStats.relChange != null ? ` (${(100 * curStats.relChange).toFixed(0)}%)` : ''}`}
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-slate-500">
                      For teachers: Mann-Kendall trend test with a correction for year-to-year memory (autocorrelation), Sen’s slope with a 95% interval, on regional yearly averages. The full map
                      controls false discoveries across cells (FDR q ≤ {manifest.fdrAlpha}).
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-950/40 p-4">
                <p className="text-sm font-semibold text-slate-100">Nothing to measure here for {short.toLowerCase()}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{noDataReason(varId, site.name)}</p>
                <p className="mt-3 text-xs font-medium text-slate-500">Try one of these clues for {site.name} instead:</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {manifest.variables
                    .filter((v) => v.id !== varId && statsFor(v.id, site.id)?.slopePerDecade != null)
                    .slice(0, 6)
                    .map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setVarId(v.id)
                          setStage('idle')
                        }}
                        className="rounded-full border border-cyan-400/40 px-3 py-1 text-sm text-cyan-100 transition hover:bg-cyan-400/10"
                      >
                        {DEFINITIONS[v.id]?.short ?? v.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* Validation ticker */}
      <footer className="relative z-10 mx-3 mb-3 flex items-center gap-4 overflow-x-auto rounded-lg border border-cyan-400/10 bg-slate-950/50 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-slate-500">
        <a href="#/checks" className="text-cyan-400 underline-offset-2 hover:underline">
          CHECKS VS PUBLISHED RECORDS ›
        </a>
        {checks.map((c) => (
          <span key={c.id} className="flex items-center gap-1" title={c.note}>
            {c.status === 'pass' ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : c.status === 'fail' ? <XCircle className="h-3 w-3 text-rose-400" /> : <Loader2 className="h-3 w-3 text-slate-500" />}
            {c.name}
          </span>
        ))}
      </footer>

      {/* Guided investigation: what and where */}
      {guide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setGuide(false)}>
          <div className="cc-glass cc-rise max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Start investigating">
            <div className="flex items-center justify-between">
              <h2 className="cc-glow flex items-center gap-2 text-base font-semibold text-cyan-100">
                <Compass className="h-4 w-4" /> Become a data detective
              </h2>
              <button onClick={() => setGuide(false)} aria-label="Close">
                <X className="h-4 w-4 text-slate-400 hover:text-slate-100" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Answer two questions and we’ll suggest where a trend might be hiding, based on published research.</p>

            <h3 className="mt-4 text-xs font-semibold tracking-[0.2em] text-cyan-400">1 · WHAT INTERESTS YOU?</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setInterest(interest === i.id ? null : i.id)}
                  aria-pressed={interest === i.id}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${interest === i.id ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {i.label}
                </button>
              ))}
            </div>

            <h3 className="mt-4 text-xs font-semibold tracking-[0.2em] text-cyan-400">2 · WHAT KIND OF PLACE?</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLACES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlace(place === p.id ? null : p.id)}
                  aria-pressed={place === p.id}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${place === p.id ? 'border-emerald-300/70 bg-emerald-400/15 text-emerald-100' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <h3 className="mt-5 text-xs font-semibold tracking-[0.2em] text-cyan-400">LEADS · {leads.length}</h3>
            <ul className="mt-2 space-y-2">
              {leads.map((l) => {
                const s = SITES.find((x) => x.id === l.siteId)!
                return (
                  <li key={l.varId + l.siteId}>
                    <button
                      onClick={() => {
                        setGuide(false)
                        clearTimers()
                        setDemo(null)
                        setVarId(l.varId)
                        select(l.siteId)
                      }}
                      className="w-full rounded-lg border border-slate-700/70 p-3 text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/5"
                    >
                      <span className="flex items-center justify-between text-sm text-slate-100">
                        {DEFINITIONS[l.varId]?.short} · {s.name}
                        <ChevronRight className="h-4 w-4 text-cyan-400" />
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">{l.why}</span>
                    </button>
                  </li>
                )
              })}
              {!leads.length && <li className="text-xs text-slate-500">No leads for that pair yet. Try another place, or explore the globe freely.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
