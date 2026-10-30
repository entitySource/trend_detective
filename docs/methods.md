# Methods (draft)

How Trend Detective decides whether something on Earth is really changing. Each part is written for students first, followed by details for teachers and judges.

## 1. From satellite files to one number per year

Every variable is put on the same 0.5° grid (about 55 km), one map per month, January 2003 to December 2025 (276 months).

1. **Remove the seasons.** Snow cover is always lower in July than in January, so for each grid cell we subtract that month's 23-year average. What is left is the *anomaly*: how unusual that month was.
2. **Average into one value per year** (or per season: Dec–Feb, Mar–May, Jun–Aug, Sep–Nov). A year needs at least 8 good months; a season needs 2 of its 3.
3. **Regions** (the 13 sites on the globe) are area-weighted averages of the cells inside their box.

*Details:* DJF is labelled by its January year. Cells with data for fewer than 90% of years are left blank.

## 2. Is it going up or down? (Mann-Kendall test)

Compare every year with every later year: count how often the later one is higher, minus how often it is lower. A real trend makes this score large; random ups and downs keep it near zero. The **p-value** is the chance of getting a score this large if nothing were really changing. We call a site's trend real when p < 0.05 ("less than 1 time in 20 by luck").

**How fast? (Sen's slope).** The median of the slopes between every pair of years. Unlike a straight-line fit, one freak year cannot drag it around. Shown per decade.

*Details: the year-to-year memory problem.* A warm year tends to be followed by another warm year (autocorrelation), which makes plain Mann-Kendall see trends that aren't there. We inflate the test's variance by (1 + r₁)/(1 − r₁), where r₁ is the lag-1 autocorrelation of the detrended series, bias-corrected for short records. In simulations of 23-year series with r₁ = 0.5 and no real trend, plain MK gave false alarms 21% of the time, Hamed–Rao 22% and our test 8%. Ours still detected a real 1σ/decade trend 76% of the time. Tests: `pipeline/tests/test_stats.py`.

## 3. Testing 100,000 cells at once (false discovery rate)

If you test 100,000 map cells at p < 0.10, about 10,000 will light up by pure luck. So the map's **"Significant (corrected)"** view uses the Benjamini–Hochberg false discovery rate: of the cells we colour, at most about 10% are expected to be flukes (q ≤ 0.10).

The **"Significant (raw)"** view shows each cell tested alone, for comparison. The gap is the lesson: for rainfall, 23% of the map looks significant raw but only 6% survives the correction; for snow, 8% falls to 0%.

## 4. Turning points ("plot twists")

A single straight-line trend can hide a rise followed by a fall. China's haze rose until 2012 and then fell steeply, so over 2003–2025 the overall trend is "not proven". The app tries every split year (at least 6 years each side) and shows a plot-twist card only when:

- the two halves go in opposite directions,
- both halves pass p < 0.1, and
- two lines leave less than half the scatter of one.

Because the split year is found by searching, those p-values are a rough guide, not a formal test.

## 5. Checking ourselves against published results

| Check | Result |
|---|---|
| Arctic September sea ice vs NSIDC | Pass (−11.56 vs −11.6 %/decade) |
| Greening in China and India (Chen et al. 2019) | Pass |
| Global sea level rising | Pass (+34 mm/decade) |
| Stratosphere cooling at 10 hPa | Pass (−0.58 K/decade) |
| Global temperature: MERRA-2 vs GISTEMP | Fail: 0.21 vs 0.275 °C/decade |
| Haze falls in E China, rises in N India | Fail for China: rise-then-fall (section 4) |
| Water loss in N India and California (Rodell et al. 2018) | Fail for California: p = 0.053, interrupted by wet years |

We keep the failures visible rather than tuning the checks to pass. Full numbers: [`datasets.md`](datasets.md).

## 6. Caveats: when the data itself can fool you

- **Satellite orbit drift.** Terra's overpass got earlier after 2020, making land look 1–2 K cooler in 2022–25, so we switched to Aqua (MYD11C3). Aqua's overpass has also been drifting later since 2022, so the last year carries a caution.
- **Models are not measurements.** Air temperature (MERRA-2) and soil moisture (GLDAS 2.1) come from models fed with observations, not from direct measurement. MERRA-2 warms more slowly than GISTEMP. MERRA-2 does not confirm GLDAS's global drying: the two agree on whether soil is getting wetter or drier on only 61% of land.
- **Instrument ageing.** OMI's row anomaly since 2007 probably inflates the ozone trend (+3.7 DU/decade, against roughly flat published records).
- **Short record.** 23 years is short for slow climate signals, and natural cycles such as El Niño can tilt a trend, especially near the ends of the record.
- **Sen's slope interval.** The 95% interval assumes independent years, so it is somewhat too narrow where autocorrelation is strong.
- **One correction family.** The false discovery rate correction covers the whole map of one variable and season, not all variables and seasons together.
- **Grid size.** At 0.5°, small places (the Delhi box) cover only a few cells and give noisier series.

## 7. Data sources

All 15 variables, with products, versions and data centres (DAACs), are listed in [`variables.md`](variables.md) and [`datasets.md`](datasets.md).
