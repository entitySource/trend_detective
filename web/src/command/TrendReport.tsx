// The case file's test result, as a short science lesson: the verdict, the three measurements a scientist would
// check (statistical significance, signal-to-noise ratio, record length), the rate of change with its 95%
// confidence interval drawn against zero, and a plain-English reading written from this place's own numbers.
import type { ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { Info } from '../components/Info'
import { CLIMATE_PERIOD_YEARS, chancePercent, interpret, intervalDirection, recordLength, signalStrength, significance, SIGNIFICANCE_LEVEL, type Tone } from './readings'
import { VERDICT_COLOR, type Verdict } from './trend'

export type ReportStats = {
  slopePerDecade: number | null
  p: number | null
  n: number
  totalChange: number | null
  snr: number | null
  ciLow: number | null
  ciHigh: number | null
  relChange?: number | null
}

type Props = {
  stats: ReportStats
  verdict: Verdict
  clue: string // short name, e.g. "Sea level"
  place: string
  units: string // value units, e.g. "mm"
  from: number
  to: number
  truncated: boolean
  fdrAlpha: number
}

const HELP = {
  p: 'The p-value is the probability of seeing a trend at least this strong if nothing were really changing (only natural ups and downs). Scientists usually call a result statistically significant when p is below 0.05, a 1-in-20 chance. A small p does not say how big the change is, only how unlikely it is to be chance.',
  snr: 'Signal-to-noise ratio = the change per decade ÷ the typical year-to-year variation around the trend line (its standard deviation). Above 1, a decade of change is bigger than a normal year’s wobble, so the trend stands out; below 0.5, natural variation dominates.',
  n: 'How many years had enough measurements to use. The World Meteorological Organization defines climate “normals” over 30 years; shorter records can still detect strong trends, but gentle ones may be missed.',
  rate: 'Sen’s slope: the median of the slopes between every pair of years. Unlike an ordinary best-fit line, one extreme year cannot pull it far. The bar shows the 95% confidence interval: the range of rates consistent with the data. If it crosses zero, even the direction is uncertain.',
  total: 'Rate × the length of the record: roughly how much the value changed from the first year to the last, if the trend held steady.',
}

const TONE_CLASS: Record<Tone, string> = {
  strong: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  moderate: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  weak: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
}

const num = (x: number | null | undefined, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : Math.abs(x) >= 100 ? x.toFixed(0) : Number(x.toPrecision(d)).toString())
const signed = (x: number) => `${x > 0 ? '+' : ''}${num(x)}`
const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${Number(p.toPrecision(2))}`)

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[tone]}`}>{children}</span>
}

function Measure({ term, plain, info, value, chip, children }: { term: string; plain: string; info: string; value: ReactNode; chip?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-100">
            {term}
            <Info text={info} />
          </p>
          <p className="text-xs leading-snug text-slate-400">{plain}</p>
        </div>
        <div className="shrink-0 text-right font-mono text-base font-semibold text-slate-50">{value}</div>
      </div>
      {children && <div className="mt-2">{children}</div>}
      {chip && <div className="mt-2">{chip}</div>}
    </div>
  )
}

// A thin track with a marker and labelled ticks; positions are 0–1 along the track.
function Scale({ at, color, ticks, ends }: { at: number; color: string; ticks: { at: number; label: string }[]; ends: [string, string] }) {
  const x = Math.max(0, Math.min(1, at))
  return (
    <div aria-hidden="true">
      <div className="relative h-1.5 rounded-full bg-slate-800">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${100 * x}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
        {ticks.map((t) => (
          <span key={t.label} className="absolute -top-1 h-3.5 w-px bg-slate-300/70" style={{ left: `${100 * t.at}%` }} />
        ))}
      </div>
      <div className="relative mt-1 h-3 text-[10px] text-slate-500">
        <span className="absolute left-0">{ends[0]}</span>
        {ticks.map((t) => (
          <span key={t.label} className="absolute -translate-x-1/2 text-slate-300" style={{ left: `${100 * t.at}%` }}>
            {t.label}
          </span>
        ))}
        <span className="absolute right-0">{ends[1]}</span>
      </div>
    </div>
  )
}

// The rate and its 95% confidence interval on a number line with zero marked.
function IntervalPlot({ est, lo, hi, color, units }: { est: number; lo: number | null; hi: number | null; color: string; units: string }) {
  const vals = [0, est, lo ?? est, hi ?? est]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = (max - min || Math.abs(est) || 1) * 0.15
  const x = (v: number) => (100 * (v - (min - pad))) / (max - min + 2 * pad)
  // Interval ends first, then zero; a label is skipped when it would overlap one already placed.
  const labels: { at: number; text: string }[] = []
  for (const [v, text] of [...(lo !== null && hi !== null ? ([[lo, num(lo)], [hi, num(hi)]] as const) : []), [0, '0'] as const])
    if (labels.every((l) => Math.abs(l.at - x(v)) > 12)) labels.push({ at: x(v), text })
  return (
    <div aria-hidden="true">
      <div className="relative h-6">
        <span className="absolute inset-x-0 top-1/2 h-px bg-slate-700" />
        <span className="absolute top-0 bottom-0 border-l border-dashed border-slate-400" style={{ left: `${x(0)}%` }} />
        {lo !== null && hi !== null && (
          <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full opacity-50" style={{ left: `${x(lo)}%`, width: `${x(hi) - x(lo)}%`, background: color }} />
        )}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950" style={{ left: `${x(est)}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <div className="relative h-3 text-[10px] text-slate-400">
        {labels.map((l) => (
          <span key={l.text} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${l.at}%` }}>
            {l.text}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{units} per decade · dot = best estimate · band = 95% confidence interval · dashed line = no change</p>
    </div>
  )
}

// The same two key measurements, compact, for the trend map's inspector (a site or a single map square).
export function CompactReadings({ p, snr, color, scope }: { p: number | null; snr: number | null; color: string; scope: string }) {
  const sig = significance(p)
  const strength = signalStrength(snr)
  return (
    <div className="space-y-2">
      {p !== null && sig && (
        <Measure term="Statistical significance" plain={`Chance of a trend this strong if nothing were changing (${scope}): ${chancePercent(p)}`} info={HELP.p} value={pText(p)} chip={<Chip tone={sig.tone}>{sig.label}</Chip>}>
          <Scale at={Math.log10(Math.max(p, 1e-4)) / -4} color={color} ticks={[{ at: Math.log10(SIGNIFICANCE_LEVEL) / -4, label: '0.05' }]} ends={['p = 1', 'p ≤ 0.0001']} />
        </Measure>
      )}
      {snr !== null && strength && (
        <Measure term="Signal-to-noise ratio" plain="Change per decade compared with normal year-to-year variation" info={HELP.snr} value={num(Math.abs(snr), 2)} chip={<Chip tone={strength.tone}>{strength.label}</Chip>}>
          <Scale
            at={Math.min(Math.abs(snr), 2) / 2}
            color="#22d3ee"
            ticks={[
              { at: 0.25, label: '0.5' },
              { at: 0.5, label: '1' },
            ]}
            ends={['0', '2+']}
          />
        </Measure>
      )}
    </div>
  )
}

export function TrendReport({ stats: s, verdict, clue, place, units, from, to, truncated, fdrAlpha }: Props) {
  const color = VERDICT_COLOR[verdict]
  const slope = s.slopePerDecade ?? 0
  const sig = significance(s.p)
  const snr = signalStrength(s.snr)
  const rec = recordLength(s.n)
  const dir = intervalDirection(s.ciLow, s.ciHigh)
  const lower = clue.toLowerCase()
  const reading = interpret({ clue: lower, place, units, from, to, slopePerDecade: slope, totalChange: s.totalChange, p: s.p, snr: s.snr, ciLow: s.ciLow, ciHigh: s.ciHigh, n: s.n })
  const total = s.totalChange
  const rel = s.relChange != null ? ` (${signed(100 * s.relChange)}% of the usual level)` : ''

  return (
    <div className="cc-rise mt-4 space-y-3">
      <div className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: `${color}66`, background: `${color}14` }}>
        {verdict === 'noise' ? <XCircle className="h-5 w-5 shrink-0 text-slate-300" /> : <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />}
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {verdict === 'noise' ? `Not proven: ${lower} here could just be natural variation` : `Case closed: ${lower} here is really ${verdict}`}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            {verdict === 'noise'
              ? `A trend like this would turn up by chance ${s.p === null ? '' : chancePercent(s.p)} of the time even if nothing were changing (${s.p === null ? 'p unknown' : pText(s.p)}). Not enough evidence yet.`
              : `From ${from} to ${to} it ${slope > 0 ? 'went up' : 'went down'} by about ${num(Math.abs(total ?? 0))} ${units}${rel}. ${s.p === null ? '' : ` If nothing were changing, a trend this strong would turn up by chance ${s.p < 0.001 ? '' : 'only '}${chancePercent(s.p)} of the time (${pText(s.p)}).`}`}
          </p>
          {truncated && <p className="mt-1 text-[13px] text-amber-200">Time machine on: a quick re-test on {s.n} years, without the correction for year-to-year memory or a confidence interval, so treat it as a rough guide.</p>}
        </div>
      </div>

      <p className="pt-1 text-xs font-semibold tracking-[0.15em] text-cyan-400">KEY MEASUREMENTS</p>

      {s.p !== null && sig && (
        <Measure
          term="Statistical significance"
          plain={`Chance of a trend this strong if nothing were changing: ${chancePercent(s.p)}`}
          info={HELP.p}
          value={pText(s.p)}
          chip={<Chip tone={sig.tone}>{sig.label}</Chip>}
        >
          <Scale
            at={Math.log10(Math.max(s.p, 1e-4)) / -4}
            color={color}
            ticks={[{ at: Math.log10(SIGNIFICANCE_LEVEL) / -4, label: '0.05' }]}
            ends={['p = 1, pure chance', 'p ≤ 0.0001']}
          />
        </Measure>
      )}

      {s.snr !== null && snr && (
        <Measure
          term="Signal-to-noise ratio"
          plain={`Change per decade compared with normal year-to-year variation: ${num(Math.abs(s.snr), 2)} times`}
          info={HELP.snr}
          value={num(Math.abs(s.snr), 2)}
          chip={<Chip tone={snr.tone}>{snr.label}</Chip>}
        >
          <Scale
            at={Math.min(Math.abs(s.snr), 2) / 2}
            color="#22d3ee"
            ticks={[
              { at: 0.25, label: '0.5' },
              { at: 0.5, label: '1' },
            ]}
            ends={['0', '2+']}
          />
        </Measure>
      )}

      <Measure
        term="Record length"
        plain={`Years of measurements tested, ${from} to ${to}, against the 30-year period climate scientists use`}
        info={HELP.n}
        value={
          <span style={{ '--text-3xl': '1rem', '--foreground': '#f8fafc' } as React.CSSProperties}>
            <AnimatedCounter value={s.n} />
            <span className="ml-1 text-xs font-normal text-slate-400">years</span>
          </span>
        }
        chip={<Chip tone={rec.tone}>{rec.label}</Chip>}
      >
        <Scale at={Math.min(s.n, CLIMATE_PERIOD_YEARS) / CLIMATE_PERIOD_YEARS} color="#34d399" ticks={[]} ends={['0', '30 years']} />
      </Measure>

      <Measure
        term="Rate of change (Sen’s slope)"
        plain={s.ciLow !== null && s.ciHigh !== null ? `95% confidence interval: ${num(s.ciLow)} to ${num(s.ciHigh)} ${units} per decade` : `About ${num(Math.abs(slope / 10), 2)} ${units} per year`}
        info={HELP.rate}
        value={
          <>
            {signed(slope)}
            <span className="block text-[11px] font-normal text-slate-400">{units} / decade</span>
          </>
        }
        chip={
          dir && (
            <Chip tone={dir === 'unclear' ? 'weak' : 'strong'}>
              {dir === 'unclear' ? 'Interval crosses zero: direction uncertain' : `Whole interval ${dir === 'up' ? 'above' : 'below'} zero: direction certain`}
            </Chip>
          )
        }
      >
        <IntervalPlot est={slope} lo={s.ciLow} hi={s.ciHigh} color={color} units={units} />
      </Measure>

      {total !== null && (
        <Measure term={`Total change, ${from}–${to}`} plain={`Rate × ${to - from} years (${from} → ${to})${rel}`} info={HELP.total} value={`${signed(total)} ${units}`} />
      )}

      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
        <p className="text-xs font-semibold tracking-[0.15em] text-cyan-300">WHAT THE DATA TELLS US</p>
        <div className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-slate-200">
          {reading.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        Method: Mann-Kendall trend test with a correction for year-to-year memory (autocorrelation, Hamed–Rao), Sen’s slope with a 95% confidence interval, on
        regional yearly averages. The full map also controls false discoveries across its many cells (FDR q ≤ {fdrAlpha}).
      </p>
    </div>
  )
}
