// Quick in-browser trend test for the timeline slider: plain Mann-Kendall (no autocorrelation
// correction) and Sen's slope. The full record uses the pipeline's corrected statistics instead.

// Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation, |error| < 1.5e-7).
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type QuickTrend = { slopePerDecade: number; p: number; n: number; totalChange: number; snr: number }

export function quickTrend(values: number[], years: number[]): QuickTrend | null {
  const pts = values.map((v, i) => [years[i], v] as const).filter(([, v]) => Number.isFinite(v))
  const n = pts.length
  if (n < 5) return null
  let s = 0
  const slopes: number[] = []
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(pts[j][1] - pts[i][1])
      slopes.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]))
    }
  const varS = (n * (n - 1) * (2 * n + 5)) / 18
  const z = s === 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(varS)
  const slope = median(slopes)
  const intercept = median(pts.map(([x, v]) => v - slope * x))
  const resid = pts.map(([x, v]) => v - (intercept + slope * x))
  const sd = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (n - 1))
  const totalChange = slope * (pts[n - 1][0] - pts[0][0])
  return { slopePerDecade: slope * 10, p: 2 * (1 - normCdf(Math.abs(z))), n, totalChange, snr: sd > 0 ? totalChange / sd : 0 }
}

export type TurningPoint = { year: number; before: QuickTrend; after: QuickTrend }

const sse = (pts: (readonly [number, number])[]) => {
  const n = pts.length
  const mx = pts.reduce((a, [x]) => a + x, 0) / n
  const my = pts.reduce((a, [, y]) => a + y, 0) / n
  const sxy = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0)
  const sxx = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0)
  const b = sxx > 0 ? sxy / sxx : 0
  return pts.reduce((a, [x, y]) => a + (y - my - b * (x - mx)) ** 2, 0)
}

// Rise-then-fall (or fall-then-rise) check: split the record where two straight lines fit best
// (each side ≥ minYears). Reported only when the two halves go opposite ways, both pass the quick
// test at p < 0.1, and two lines leave less than half the scatter of one line.
export function turningPoint(values: number[], years: number[], minYears = 6): TurningPoint | null {
  const pts = values.map((v, i) => [years[i], v] as const).filter(([, v]) => Number.isFinite(v))
  if (pts.length < 2 * minYears) return null
  const whole = sse(pts)
  let best: { k: number; e: number } | null = null
  for (let k = minYears; k <= pts.length - minYears; k++) {
    const e = sse(pts.slice(0, k)) + sse(pts.slice(k))
    if (!best || e < best.e) best = { k, e }
  }
  if (!best || best.e >= 0.5 * whole) return null
  const a = pts.slice(0, best.k)
  const b = pts.slice(best.k)
  const before = quickTrend(a.map(([, v]) => v), a.map(([x]) => x))
  const after = quickTrend(b.map(([, v]) => v), b.map(([x]) => x))
  if (!before || !after || Math.sign(before.slopePerDecade) === Math.sign(after.slopePerDecade)) return null
  if (before.p >= 0.1 || after.p >= 0.1) return null
  return { year: a[a.length - 1][0], before, after }
}
