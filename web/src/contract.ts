// Types for the files the pipeline writes. Source of truth: pipeline/td/contract.py and docs/data-contract.md.

export type Season = 'ANN' | 'DJF' | 'MAM' | 'JJA' | 'SON'
export const PLANES = ['slope', 'p', 'q', 'snr'] as const
export type Plane = (typeof PLANES)[number]

export type Grid = { lat0: number; dlat: number; nlat: number; lon0: number; dlon: number; nlon: number }

export type VariableEntry = {
  id: string
  label: string
  trendUnits: string
  palette: string[]
  colorRange: [number, number]
  layers: Partial<Record<Season, { slope: string; class: string; grid: string }>>
  regions: string
  pixels: { tileDeg: number; resDeg: number; scale: number; offset: number; path: string } | null
  note?: string
  caution?: string
}

export type Manifest = {
  contractVersion: 1
  generated: string
  mock: boolean
  window: { start: string; end: string; years: number }
  grid: Grid
  planes: Plane[]
  seasons: Season[]
  fdrAlpha: number
  overlayBounds: [[number, number], [number, number], [number, number], [number, number]]
  variables: VariableEntry[]
  files: { contrasts: string; ranking: string; validation: string; regions: string }
  catalogue?: CatalogueEntry[]
}

// Tier 2/3 variables: listed in the app, trends not computed yet (docs/variables.md).
export type CatalogueEntry = { id: string; label: string; tier: 2 | 3; sphere: string; product: string; note?: string; caution?: string }

export type TrendStats = {
  slopePerDecade: number | null
  ciLow: number | null
  ciHigh: number | null
  p: number | null
  pOriginal?: number | null
  snr: number | null
  totalChange: number | null
  relChange?: number | null
  n: number
}

export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`
