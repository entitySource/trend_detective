// Two reading pages for students, teachers and judges: "Can you trust it?" (#/checks: our results
// against published science, failures included) and "How it works" (#/methods: the plain-language
// version of docs/methods.md). Both read the same contract files as the other views.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Map as MapIcon, XCircle } from 'lucide-react'
import { dataUrl, type Manifest } from './contract'

type Check = { id: string; name: string; status: 'pass' | 'fail' | 'pending'; ours?: number; published?: number; tolerance?: number; units?: string; note?: string }

// What each check means and, for failures, why it failed. Keyed by validation.json check id.
const EXPLAIN: Record<string, { why: string; verdict: string }> = {
  'sea-ice': {
    why: 'Arctic sea ice in September (its yearly minimum) is one of the best-measured signals of a warming planet. The US National Snow and Ice Data Center publishes the official trend.',
    verdict: 'Our number matches theirs to within a tenth of a percent per decade.',
  },
  gistemp: {
    why: 'NASA’s GISTEMP record, built from thousands of thermometers, is the standard measure of global warming. Our air temperature comes from MERRA-2, a model fed with observations.',
    verdict:
      'MERRA-2 warms about a quarter more slowly than GISTEMP over these 23 years, and on its own the trend does not pass our strict test. The lesson: model-based data can disagree with direct measurement, so we label air temperature as model data.',
  },
  'aod-signs': {
    why: 'Published studies report that haze (aerosol) fell over eastern China after clean-air rules and rose over northern India.',
    verdict:
      'India matches. China does not fit one straight line: haze rose until about 2012 and then fell steeply, so the overall 2003–2025 trend is “not proven”. The app flags this as a plot twist instead of hiding it.',
  },
  'ndvi-signs': {
    why: 'Chen et al. (2019, Nature Sustainability) found that China and India lead the world in greening, from tree planting and farming.',
    verdict: 'Both regions show a strong, clear greening trend in our data.',
  },
  'tws-signs': {
    why: 'Rodell et al. (2018, Nature) used the GRACE satellites to show groundwater loss in northern India and California’s Central Valley.',
    verdict:
      'Northern India matches. California just misses our cut-off (p = 0.053, where we need below 0.05): very wet years in 2017, 2019 and 2023 interrupt the decline. The water loss is real in the published work; our 23-year test is simply cautious.',
  },
  sealevel: {
    why: 'Satellite altimeters have measured steady global sea level rise since 1993.',
    verdict: 'Our data shows a clear rise of about 3.4 mm per year, in line with published values.',
  },
  'strat-cooling': {
    why: 'Greenhouse gases warm the lower atmosphere but cool the stratosphere high above. This “fingerprint” separates them from changes in the Sun.',
    verdict: 'Our data shows the stratosphere at 10 hPa (about 30 km up) cooling clearly.',
  },
}

function useManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(dataUrl('manifest.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`)
        return r.json() as Promise<Manifest>
      })
      .then(async (m) => {
        setManifest(m)
        const val = await fetch(dataUrl(m.files.validation)).then((r) => r.json())
        setChecks(val.checks ?? [])
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  return { manifest, checks, error }
}

function Page({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="cc-grid min-h-screen text-slate-200">
      <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-4 text-sm">
        <a href="#/" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-cyan-200 transition hover:bg-cyan-400/10">
          <ArrowLeft className="h-3.5 w-3.5" /> Globe
        </a>
        <a href="#/map" className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-cyan-200 transition hover:bg-cyan-400/10">
          <MapIcon className="h-3.5 w-3.5" /> Trend map
        </a>
        <span className="ml-auto flex gap-2">
          <a href="#/methods" className="rounded-lg px-2 py-1.5 text-slate-400 hover:text-cyan-200">How it works</a>
          <a href="#/checks" className="rounded-lg px-2 py-1.5 text-slate-400 hover:text-cyan-200">Can you trust it?</a>
        </span>
      </nav>
      <article className="mx-auto max-w-3xl px-4 pt-8 pb-16 text-base leading-relaxed">
        <p className="font-mono text-[10px] tracking-[0.3em] text-cyan-400">{kicker}</p>
        <h1 className="cc-glow mt-1 text-3xl font-semibold text-cyan-50">{title}</h1>
        {children}
      </article>
    </div>
  )
}

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-10 text-xl font-semibold text-cyan-100">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 text-slate-300">{children}</p>
const Detail = ({ children }: { children: ReactNode }) => (
  <details className="mt-3 rounded-lg border border-slate-700/70 px-3 py-2 text-sm text-slate-400">
    <summary className="cursor-pointer text-slate-300">For teachers and judges</summary>
    <div className="mt-2 space-y-2">{children}</div>
  </details>
)

export function ChecksPage() {
  const { checks, error } = useManifest()
  const passed = checks.filter((c) => c.status === 'pass').length
  return (
    <Page kicker="CAN YOU TRUST IT?" title="We checked our answers against published science">
      <P>
        A tool that finds trends is only useful if its trends are right. So before trusting it, we asked it questions scientists have already answered, and compared. We
        show every check, <strong className="text-slate-100">including the ones that failed</strong>: a failed check teaches you where the data or the method has
        limits.
      </P>
      {error && <p className="mt-6 text-rose-300">Could not load the checks: {error}</p>}
      {!error && !checks.length && <Loader2 className="mt-6 h-5 w-5 animate-spin text-cyan-400" />}
      {checks.length > 0 && (
        <p className="mt-6 font-mono text-xs text-slate-400">
          {passed} OF {checks.length} CHECKS PASS
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {checks.map((c) => {
          const ex = EXPLAIN[c.id]
          const pass = c.status === 'pass'
          return (
            <li key={c.id} className={`cc-glass rounded-xl p-4 ${pass ? '' : 'border-rose-400/30'}`}>
              <h3 className="flex items-start gap-2 font-semibold text-slate-100">
                {pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
                <span>
                  {c.name}
                  <span className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] ${pass ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>
                    {pass ? 'PASS' : 'FAIL'}
                  </span>
                </span>
              </h3>
              {ex && <p className="mt-2 text-slate-300">{ex.why}</p>}
              {c.ours !== undefined && c.published !== undefined && (
                <p className="mt-2 font-mono text-xs text-slate-400">
                  Ours {c.ours.toFixed(2)} · Published {c.published.toFixed(2)} {c.units} · allowed gap ±{c.tolerance}
                </p>
              )}
              {ex && <p className={`mt-2 ${pass ? 'text-emerald-100/90' : 'text-rose-100/90'}`}>{ex.verdict}</p>}
              {c.note && <p className="mt-2 font-mono text-[11px] text-slate-500">{c.note}</p>}
            </li>
          )
        })}
      </ul>
      <H2>Why keep the failures?</H2>
      <P>
        We could have loosened the checks until everything passed. That would make the tool look better and teach you less. Each failure points at something real: model
        data that runs cool, a trend that changed direction, a record too short to be sure. Those are exactly the traps a good data detective learns to spot.
      </P>
      <P>
        Read <a href="#/methods" className="text-cyan-300 underline">How it works</a> for how a trend gets judged real, and the full list of caveats.
      </P>
    </Page>
  )
}

export function MethodsPage() {
  const { manifest } = useManifest()
  const years = manifest ? `${manifest.window.start.slice(0, 4)}–${manifest.window.end.slice(0, 4)}` : '2003–2025'
  const rows = (manifest?.variables ?? [])
    .map((v) => ({ id: v.id, label: v.label, area: v.layers.ANN?.sigArea }))
    .filter((r): r is { id: string; label: string; area: { raw: number; fdr: number } } => !!r.area)
    .sort((a, b) => b.area.raw - b.area.fdr - (a.area.raw - a.area.fdr))
  return (
    <Page kicker="HOW IT WORKS" title="How we decide whether something is really changing">
      <P>
        Nature is noisy: one hot summer or one wet year proves nothing. Trend Detective uses NASA satellite data from {years} and the same tests climate scientists use to
        separate a real, steady change from random ups and downs.
      </P>

      <H2>1 · Take out the seasons</H2>
      <P>
        Snow is always lower in July than in January, so comparing months directly is useless. For every place on Earth we compare each month with the usual value for
        that month. What is left, called the <em>anomaly</em>, shows how unusual that month was. Then we average to one value per year (or per season).
      </P>
      <Detail>
        <p>
          Every variable sits on the same 0.5° grid (about 55 km). Anomalies are relative to each calendar month’s mean over the whole record. A year needs at least 8 good
          months, a season 2 of its 3; December–February is labelled by its January. Cells with data for fewer than 90% of years are left blank. Sites are area-weighted
          averages of the cells in their box.
        </p>
      </Detail>

      <H2>2 · Is it going up or down?</H2>
      <P>
        We compare every year with every later year and count how often the later one is higher, minus how often it is lower. A real trend gives a big score; random
        wiggles keep it near zero. This is the <strong className="text-slate-100">Mann-Kendall test</strong>.
      </P>
      <P>
        The <strong className="text-slate-100">p-value</strong> is the chance of seeing a score this big if nothing were really changing. We call a trend real when p is
        below 0.05: less than 1 chance in 20 that luck alone did it.
      </P>
      <P>
        How fast? We take the middle value of the slopes between every pair of years (<strong className="text-slate-100">Sen’s slope</strong>), shown per decade. Unlike a
        ruler-straight line fit, one freak year cannot drag it around.
      </P>
      <Detail>
        <p>
          Years remember each other: a warm year is often followed by another warm year (autocorrelation), and that fools the plain test into seeing trends that are not
          there. We widen the test’s uncertainty by (1 + r₁)/(1 − r₁), where r₁ is the bias-corrected lag-1 autocorrelation of the detrended series.
        </p>
        <p>
          In simulations of 23-year records with r₁ = 0.5 and no real trend, the plain test raised false alarms 21% of the time, the commonly used Hamed–Rao correction
          22%, and ours 8%. Ours still caught a real trend of one standard deviation per decade 76% of the time.
        </p>
      </Detail>

      <H2>3 · Test 100,000 places and some will fool you</H2>
      <P>
        If you flip a coin 100,000 times you will see some amazing streaks. The same happens on a map: test every grid cell at once, and thousands will look
        “significant” by pure luck. So the trend map has two views:
      </P>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-300">
        <li>
          <strong className="text-slate-100">Significant (raw):</strong> each place tested on its own.
        </li>
        <li>
          <strong className="text-slate-100">Significant (corrected):</strong> only places that survive a correction for testing so many at once. Of the places shown,
          at most about 1 in 10 is expected to be a fluke.
        </li>
      </ul>
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left text-slate-400">Share of the map that looks significant (whole year)</caption>
            <thead className="font-mono text-[10px] tracking-wider text-cyan-400">
              <tr>
                <th className="py-1 pr-3 font-normal">VARIABLE</th>
                <th className="py-1 pr-3 text-right font-normal">RAW</th>
                <th className="py-1 pr-3 text-right font-normal">CORRECTED</th>
                <th className="py-1 font-normal">
                  <span className="sr-only">Comparison</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-300">{r.label}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-slate-400">{r.area.raw.toFixed(0)}%</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-slate-100">{r.area.fdr.toFixed(0)}%</td>
                  <td className="w-1/3 py-1.5" aria-hidden="true">
                    <div className="relative h-2 rounded bg-slate-800">
                      <div className="absolute inset-y-0 left-0 rounded bg-slate-500/50" style={{ width: `${r.area.raw}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded bg-cyan-400" style={{ width: `${r.area.fdr}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <P>The grey bar is what looks significant; the bright part is what survives. The gap is how much a careless reading of the map would get wrong.</P>
      <Detail>
        <p>
          The correction is the Benjamini–Hochberg false discovery rate at q ≤ 0.10, applied across the whole map of one variable and one season (not across all variables
          and seasons together). Percentages are area-weighted, so polar cells do not count more than tropical ones.
        </p>
      </Detail>

      <H2>4 · Plot twists</H2>
      <P>
        One straight line can hide a story. Haze over China rose until about 2012 and then fell steeply, so over the whole record the trend looks “not proven”. The app
        tries every possible turning year and shows a plot-twist card only when the two halves go in opposite directions, both halves pass a looser p &lt; 0.1 test, and
        two lines fit far better than one (less than half the leftover scatter).
      </P>
      <Detail>
        <p>Each half needs at least 6 years. Because the turning year is found by searching, the p-values on a plot-twist card are a rough guide, not a formal test.</p>
      </Detail>

      <H2>5 · When the data itself can fool you</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
        <li>
          <strong className="text-slate-100">Satellites drift.</strong> Terra’s overpass time slowly got earlier after 2020, so land looked 1–2 °C cooler than it was. We
          switched land temperature to the Aqua satellite, but Aqua also drifts since 2022, so treat the last year with care.
        </li>
        <li>
          <strong className="text-slate-100">Models are not measurements.</strong> Air temperature (MERRA-2) and soil moisture (GLDAS) come from computer models fed with
          observations. MERRA-2 warms more slowly than thermometer records, and two models agree on whether soil is drying on only 61% of land.
        </li>
        <li>
          <strong className="text-slate-100">Instruments age.</strong> A fault on the OMI ozone instrument since 2007 probably exaggerates the ozone trend.
        </li>
        <li>
          <strong className="text-slate-100">23 years is short.</strong> Slow climate signals and natural cycles like El Niño can tilt a trend, especially near the
          start and end of the record.
        </li>
        <li>
          <strong className="text-slate-100">Small places are noisy.</strong> At 55 km per cell, a city-sized box covers only a few cells.
        </li>
      </ul>
      <Detail>
        <p>The 95% interval on Sen’s slope assumes independent years, so it is somewhat too narrow where autocorrelation is strong.</p>
      </Detail>

      <H2>6 · Did we get it right?</H2>
      <P>
        We checked our results against seven published findings and kept the failures visible. See{' '}
        <a href="#/checks" className="text-cyan-300 underline">
          Can you trust it?
        </a>
      </P>
    </Page>
  )
}
