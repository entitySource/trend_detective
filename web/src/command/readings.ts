// How to read a trend test, as rules a student can learn: what each number means and where the usual
// scientific thresholds sit. Used by the case file's trend report and the trend map inspector.

export const SIGNIFICANCE_LEVEL = 0.05 // the conventional 5% level
export const CLIMATE_PERIOD_YEARS = 30 // WMO climate normals are 30-year averages

export type Tone = 'strong' | 'moderate' | 'weak'

// p as a percentage a student can picture: "1.3%", "under 0.1%".
export function chancePercent(p: number): string {
  if (p < 0.001) return 'less than 0.1%'
  const pct = 100 * p
  return `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`
}

export function significance(p: number | null): { label: string; tone: Tone } | null {
  if (p === null || !Number.isFinite(p)) return null
  if (p < 0.01) return { label: 'Highly significant (p < 0.01)', tone: 'strong' }
  if (p < SIGNIFICANCE_LEVEL) return { label: 'Significant (p < 0.05)', tone: 'strong' }
  if (p < 0.1) return { label: 'Weak evidence (p < 0.10)', tone: 'moderate' }
  return { label: 'Not significant (p ≥ 0.10)', tone: 'weak' }
}

// Signal-to-noise: change per decade divided by the typical year-to-year scatter around the trend line.
export function signalStrength(snr: number | null): { label: string; tone: Tone } | null {
  if (snr === null || !Number.isFinite(snr)) return null
  const a = Math.abs(snr)
  if (a >= 1) return { label: 'Strong signal', tone: 'strong' }
  if (a >= 0.5) return { label: 'Moderate signal', tone: 'moderate' }
  return { label: 'Weak signal, mostly natural variation', tone: 'weak' }
}

export function recordLength(n: number): { label: string; tone: Tone } {
  if (n >= CLIMATE_PERIOD_YEARS) return { label: 'Climate-length record (30+ years)', tone: 'strong' }
  if (n >= 20) return { label: 'Long enough to detect clear trends', tone: 'moderate' }
  return { label: 'Short record: only strong trends can be detected', tone: 'weak' }
}

// Does the 95% confidence interval for the rate stay on one side of zero?
export type Direction = 'up' | 'down' | 'unclear'
export function intervalDirection(lo: number | null, hi: number | null): Direction | null {
  if (lo === null || hi === null || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  if (lo > 0) return 'up'
  if (hi < 0) return 'down'
  return 'unclear'
}

const num = (x: number, d = 3) => (Math.abs(x) >= 100 ? x.toFixed(0) : Number(x.toPrecision(d)).toString())

// Site names read naturally in a sentence: "in the Sahel", "in Europe", "across the whole world".
const THE = /^(Arctic|Indo-Gangetic|Delhi|Middle East|California|Amazon|Sahel|Tibetan|Aral|Congo|Horn|US |Eastern United|Great Barrier|Ganges|Antarctic)/
export const inPlace = (name: string) => (/^Whole world$/i.test(name) ? 'across the whole world' : `in ${THE.test(name) ? 'the ' : ''}${name}`)

export type ReadingInput = {
  clue: string // e.g. "sea level"
  place: string
  units: string // value units, e.g. "mm"
  from: number
  to: number
  slopePerDecade: number
  totalChange: number | null
  p: number | null
  snr: number | null
  ciLow: number | null
  ciHigh: number | null
  n: number
}

// A plain-English reading of the test, built only from the numbers, so every place gets its own explanation.
export function interpret(r: ReadingInput): string[] {
  const dir = r.slopePerDecade > 0 ? 'rose' : r.slopePerDecade < 0 ? 'fell' : 'stayed level'
  const out: string[] = []
  const total = r.totalChange !== null ? ` (about ${num(Math.abs(r.totalChange))} ${r.units} in total)` : ''
  out.push(
    r.slopePerDecade === 0
      ? `${cap(r.clue)} ${inPlace(r.place)} shows no overall change between ${r.from} and ${r.to}.`
      : `${cap(r.clue)} ${inPlace(r.place)} ${dir} by about ${num(Math.abs(r.slopePerDecade))} ${r.units} per decade between ${r.from} and ${r.to}${total}.`,
  )
  const s = signalStrength(r.snr)
  if (s && r.snr !== null)
    out.push(
      s.tone === 'weak'
        ? `That change is small next to normal year-to-year variation (signal-to-noise ${num(Math.abs(r.snr), 2)}), so single years can easily hide it.`
        : `Each decade's change is ${num(Math.abs(r.snr), 2)} times the normal year-to-year variation, a ${s.tone} signal.`,
    )
  if (r.p !== null) {
    const chance = chancePercent(r.p)
    out.push(
      r.p < SIGNIFICANCE_LEVEL
        ? `If ${r.clue} were not really changing here, a trend this strong would appear by chance ${r.p < 0.001 ? '' : 'only '}${chance} of the time, so it is statistically significant.`
        : `If ${r.clue} were not really changing here, a trend like this would still appear by chance ${chance} of the time, so it is not statistically significant: the data cannot yet tell a real change from natural ups and downs.`,
    )
  }
  const d = intervalDirection(r.ciLow, r.ciHigh)
  if (d === 'up' || d === 'down')
    out.push(`The 95% confidence interval for the rate (${num(r.ciLow!)} to ${num(r.ciHigh!)} ${r.units} per decade) stays ${d === 'up' ? 'above' : 'below'} zero, so the direction is clear even though the exact speed is uncertain.`)
  else if (d === 'unclear') out.push(`The 95% confidence interval for the rate (${num(r.ciLow!)} to ${num(r.ciHigh!)} ${r.units} per decade) includes zero, so even the direction of change is uncertain.`)
  if (r.n < 20) out.push(`With only ${r.n} years of data, a real but gentle trend could still be missed; more years make the test more sensitive.`)
  return out
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
