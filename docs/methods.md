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

The **"Significant (raw)"** view shows each cell tested alone, for comparison. The gap is the lesson: for rainfall, 23% of the map looks significant raw but only 6% survives the correction; for snow, 15% falls to 0%.

Sea ice and snow maps leave blank the places where they are never there (open ocean that never freezes, snow-free tropics) or always there (ice sheets): a trend of exactly zero there means nothing, and those cells would otherwise dilute the correction.

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
| Global temperature: our map vs NASA GISTEMP | Pass (0.275 vs 0.275 °C/decade). Earlier MERRA-2 version failed (0.21) |
| Haze falls in E China since 2013, rises in N India | Pass. China is tested from 2013, the period of the published decline (clean-air plan); over 2003–2025 its rise-then-fall is "not proven" (section 4) |
| Water loss in N India and California (Rodell et al. 2018) | Partial: right direction everywhere, but California p = 0.053 (a pass needs < 0.05), interrupted by wet years |

A check is **partial** when every region goes the published way with p < 0.10 but not all reach p < 0.05. We keep shortfalls visible rather than tuning the checks to pass: each check tests the period its source describes, and the 0.05 bar never moves. Full numbers: [`datasets.md`](datasets.md).

## 6. Caveats: when the data itself can fool you

- **Satellite orbit drift.** Terra's overpass got earlier after 2020, making land look 1–2 K cooler in 2022–25, and Aqua's afternoon pass drifted after 2022 (2025 tropics 1.2 K too cold). Ground heat now uses Aqua's night pass (`LST_Night_CMG`), which barely feels the drift: over land it trends +0.40 K/decade against GISTEMP's +0.38, and 2025 no longer dips.
- **Models are not measurements.** Air temperature first came from MERRA-2, a reanalysis that warms about 25% more slowly than thermometers (0.21 vs 0.28 °C/decade), so it now uses GISTEMP v4, NASA's thermometer record (2° grid, bilinear to 0.5°). Soil moisture first came from a model too (GLDAS 2.1), but GLDAS and MERRA-2 topsoil wetness agreed on wetter vs drier on only 61% of land. It now uses ESA CCI Soil Moisture v09.2 COMBINED, a merged satellite microwave record (daily 0.25° → monthly 0.5°, 2003–2024, tested on its own 22 years). CCI confirms the Mediterranean drying both models show (p < 0.01) and finds no proven global trend, where GLDAS showed global drying (a likely forcing artefact).
- **Instrument ageing.** OMI's row anomaly since 2007 inflated the ozone trend (+3.7 DU/decade, against roughly flat published records). MERRA-2 (TO3), which assimilates OMI and Aura MLS, halved it (+1.8 DU/decade) but over 2012–2025 still ran 1–2.5 DU/decade above the independent Suomi NPP OMPS record in every latitude band. Ozone therefore comes from OMPS (daily 1° L3, averaged to months), 2012–2025 only: near-global +1.5 DU/decade, p = 0.59, consistent with roughly flat published records. Its trends use those 14 years (`start_year` in the config).
- **Short record.** 23 years is short for slow climate signals, and natural cycles such as El Niño can tilt a trend, especially near the ends of the record.
- **Sen's slope interval.** The 95% interval assumes independent years, so it is somewhat too narrow where autocorrelation is strong.
- **One correction family.** The false discovery rate correction covers the whole map of one variable and season, not all variables and seasons together.
- **Grid size.** At 0.5°, small places (the Delhi box) cover only a few cells and give noisier series.

## 7. Data sources

All 15 variables, with products, versions and data centres (DAACs), are listed in [`variables.md`](variables.md) and [`datasets.md`](datasets.md).
