// One place's yearly series as a self-describing CSV: '#' header lines say what, where, from which data and how
// to cite it, then year,anomaly rows (a missing year is an empty cell), so a student can redo the test in a spreadsheet.
import type { TrendStats } from '../contract'

export type SeriesExport = {
  clue: string
  place: string
  source: string
  units: string
  years: number[]
  values: (number | null)[]
  stats: TrendStats
  url: string
}

// "°C/decade" or "mm/day per decade" → the per-year unit of the values themselves.
export const valueUnits = (trendUnits: string) => trendUnits.replace(/\s*\/\s*decade$/, '').replace(/\s+per decade$/, '')

const num = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '' : String(Number(x.toPrecision(6))))

export function seriesCsv(e: SeriesExport): string {
  const s = e.stats
  const head = [
    `# Trend Detective: ${e.clue} at ${e.place}`,
    `# Source: ${e.source}`,
    `# Values: each year's difference from this place's usual level (anomaly), in ${e.units}`,
    `# Trend over the full record: ${num(s.slopePerDecade)} ${e.units} per decade (95% range ${num(s.ciLow)} to ${num(s.ciHigh)}), p = ${num(s.p)}, ${s.n} years`,
    `# Method: Sen's slope and Mann-Kendall test with autocorrelation correction; see ${e.url}#/methods`,
    `# Cite: Trend Detective (2026), NASA Space Apps Challenge, ${e.url}`,
  ]
  const rows = e.years.map((y, i) => `${y},${num(e.values[i])}`)
  return [...head, 'year,anomaly', ...rows].join('\n') + '\n'
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
