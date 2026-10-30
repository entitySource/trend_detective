# Datasets: Phase 0 check

Checked on **25 Oct 2026** against NASA's public CMR catalogue (no login), using `pipeline/scripts/check_datasets.py`. Rerun it any time.

Analysis window: Jan 2003 – Dec 2025 = **276 months**.

| Variable | Product | Version | CMR collection | Coverage | Granules in window | Status |
|---|---|---|---|---|---|---|
| Air temperature | MERRA-2 `M2TMNXSLV` (var `T2M`) | 5.12.4 | C1276812859-GES_DISC | 1980 → present | 276 | OK |
| Topsoil wetness | MERRA-2 `M2TMNXLND` (var `GWETTOP`) | 5.12.4 | C1276812856-GES_DISC | 1980 → present | 276 | OK |
| Precipitation | GPM IMERG Final `GPM_3IMERGM` | 07 | C2723754851-GES_DISC | 1998 → **2025-09-30** | **273** | Ends Sep 2025 |
| Vegetation (NDVI) | MODIS Terra `MOD13C2` | 061 | C2565788914-LPCLOUD | 2000-02 → present | 276 | OK |
| Haze (AOD) | MERRA-2 `M2TMNXAER` (var `TOTEXTTAU`) | 5.12.4 | C1276812866-GES_DISC | 1980 → present | 276 | OK (replaced MODIS MYD08_M3 on 26 Oct; see below) |

Validation sources (HTTP 200 on 25 Oct 2026):

- NSIDC Sea Ice Index G02135, September Arctic extent CSV: `https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v4.0.csv`
- NASA GISTEMP v4 global means CSV: `https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv`

## Findings that change the plan

1. **IMERG Final stops at September 2025.**
   - ANN 2025 still qualifies (9 of 12 months, and the rule is ≥ 8).
   - SON 2025 does not (0 of 3 months), so that year is NaN for precipitation. No code change is needed; the aggregation rules already handle it.
   - Mention it on the Methods page.
2. **The MYD08_M3 version is `6.1`, not `061`.** It's fixed in `pipeline/config/variables.yaml`.
3. **MYD08_M3 has 277 granules for 276 months.**
   - It's probably a reprocessed duplicate.
   - Before downloading, `fetch.py` must keep only one granule per month.

## Sample-file check (26 Oct 2026, Tier 1)

`pipeline/scripts/sample_granules.py` downloaded one real file per dataset and opened it. All five open on Windows with pip packages; `pyhdf` handles HDF4 without needing conda.

| Variable | File size | Full record | Grid / layout | Units, fill, scale | What the pipeline must do |
|---|---|---|---|---|---|
| NDVI (MOD13C2) | 106 MB | **29 GB** | 3600 × 7200 (0.05°) | NDVI; fill −3000; **value = raw ÷ 10000** | Process each file then delete it |
| Water storage (GRACE) | 46 MB | **46 MB (one file)** | (time 259, 360, 720), 0.5° | cm; fill −99999; months **Apr 2002 – Jul 2026** | Read once; mask ice sheets (values down to −2242 cm) |
| Haze, MODIS MYD08_M3 (dropped) | 368 MB (1,144 variables) | ≈102 GB | 180 × 360 (1°) | unitless; fill −9999; value = raw × 0.001 | Too big for the timeline |
| **Haze, MERRA-2 `TOTEXTTAU` (used)** | **0.73 MB subset** (84 MB full) | **≈0.2 GB** | (1, 361, 576), 0.5° × 0.625° | unitless; fill 1e15; July 2015 range 0.01–1.28 | Download through OPeNDAP, requesting only `TOTEXTTAU` |
| Air temperature (MERRA-2) | 79 MB (94 variables) | **22 GB** | (1, 361, 576), 0.5° × 0.625° | K; fill 1e15 | Request only T2M through GES DISC's subsetting (OPeNDAP), so each file is about 1 MB |
| Precipitation (IMERG) | 19 MB | **5.3 GB** | (1, **3600 lon**, 1800 lat), 0.1° | mm/hr; fill −9999.9 | **Transpose to (lat, lon)**; × 24 for mm/day; fields sit in the `Grid` group |

**Gotchas found**

1. **Decided: haze comes from MERRA-2, by subsetting.**
   - The old GES DISC subsetting server (`goldsmr4…/opendap`) now returns **410 Gone**.
   - The working route is NASA's cloud OPeNDAP. Each file's address is in its CMR record (RelatedUrls, type "OPENDAP DATA"). Add `.dap.nc4?dap4.ce=/TOTEXTTAU;/lat;/lon;/time` to request only those fields.
   - It authenticates through `_netrc`, the same as other downloads.
   - The same route should shrink MERRA-2 T2M (`/T2M`) from 22 GB to about 0.2 GB, but that hasn't been tested yet.
2. **IMERG is stored longitude-first.** Transpose it, or every map will be rotated.
3. **Searching by month can return the neighbouring month's file.** With MYD08, a July 2015 search returned the June file. The fetch step must match on each file's start date for every product.
4. **GRACE now runs to Jul 2026.** Trends still use the common 2003–2025 window.

The sample files are in `data/raw/sample/`, about 620 MB and gitignored. Delete them whenever you like.

## Tier 1 fetch results (27 Oct 2026)

`pipeline/scripts/fetch.py all` regridded every Tier 1 dataset to 0.5° monthly fields in `data/interim/{var}.npz` (gitignored; rerun to rebuild, the script resumes).

| Variable | Months filled | Time | Sanity check |
|---|---|---|---|
| Air temperature (T2M) | 276 / 276 | minutes (OPeNDAP) | Global trend 0.206 °C/decade vs GISTEMP 0.275: **fails** the ±0.05 check (MERRA-2 p=0.22 under vc) |
| Haze (TOTEXTTAU) | 276 / 276 | minutes (OPeNDAP) | Indo-Gangetic rise and Europe fall significant; E China fall not significant |
| Precipitation (IMERG) | 273 / 273 (ends Sep 2025) | 2.8 min | Global mean 2.76 mm/day; wettest band 6.25°N |
| Vegetation (NDVI) | 276 / 276 | 128 min | Range −0.2 to 1.0. Greening: China +0.033/decade (p=0.010), India +0.037/decade (p=0.0002), as in Chen et al. 2019 |
| Water storage (GRACE) | 243 / 276 (GRACE gap 2017–18) | < 1 min | N India −24 cm/decade (p=0.04), California −13 (p=0.01), as in Rodell et al. 2018; Okavango flat (check 2002–2016 window) |

## Tier 2/3 fetch results and checks (29 Oct 2026)

Regional annual trends, 2003–2025, Sen slope with the vc Mann-Kendall test (`pipeline/scripts/check_tier23.py`). NO2 finished on 29 Oct (412 min, no failed months).

| Variable | Months | Check | Result | Verdict |
|---|---|---|---|---|
| Sea level (NASA-SSH, `ssha`) | 276 | Global mean rise, NASA ≈ 3.3–4 mm/yr | **+3.4 mm/yr** (p < 0.0001) | Pass |
| Sea ice (NSIDC-0051) | 276 | Arctic September decline | −2.7 %-pts/decade (p = 0.05) | Pass (sign; slower after 2007, as published) |
| Ozone (OMI) | 255 (from Oct 2004) | Near-global ozone roughly flat | **+3.7 DU/decade** (p < 0.0001) | **Suspect**: likely OMI row-anomaly drift; flag before showing |
| Ozone (OMI) | | Antarctic October hole recovery | −4 DU/decade (p = 0.65) | Not significant; noisy |
| Sea-surface temp. (MODIS-Aqua day) | 276 | Ocean warming | +0.27 °C/decade (p = 0.07) | Pass (sign, size) |
| Land surface temp. (MYD11C3 Aqua day; was MOD11C3 Terra, see below) | 276 | Arctic land warming fastest | Arctic +0.55 °C/decade (p = 0.003); global +0.24 (p = 0.024) | Pass (pattern) |
| Snow cover (MOD10CM) | 271 of 273 | NH spring snow decline | −0.5 %-pts/decade (p = 0.39) | Weak; not significant |
| Soil moisture (GLDAS 2.1) | 276 | No firm reference | Global topsoil drying −0.45 kg/m²/decade (p = 0.0001) | **Caution**: GLDAS 2.1 forcing changes can create trends |
| Stratosphere 10 hPa (AIRS) | 276 | CO2 cooling, published ≈ −0.5 to −0.6 K/decade | **−0.58 K/decade** (p < 0.0001); tropics −0.67 (p = 0.001) | Pass. Switched from 50 hPa on 29 Oct: 50 hPa was flat (−0.01 K/decade, p = 0.82) because ozone recovery offsets CO2 there |
| Chlorophyll (MODIS-Aqua) | 276 | No robust global trend expected | +0.014 mg/m³/decade (p = 0.28) | Pass (flat) |
| NO2 (OMI, tropospheric) | 255 (from Oct 2004) | Falling over Europe and the US (Krotkov et al. 2016) | Europe −0.33, eastern US −0.55 ×10¹⁵ molec/cm²/decade (p < 0.002) | Pass |
| NO2 (OMI) | | Eastern China rose to ~2011, then fell; India rising | E China −1.8 (p = 0.42); India +0.21 (p = 0.29) | Expected: a rise-then-fall is not a single trend; India's direction right but not significant |

Missing months: snow 2025-09 and 2025-12 (source files unreadable after 3 tries); IMERG ends 2025-09; OMI starts 2004-10.

### Soil moisture cross-check: GLDAS 2.1 vs MERRA-2 GWETTOP (29 Oct 2026)

`pipeline/scripts/crosscheck_soil.py` fetched MERRA-2 topsoil wetness (`M2TMNXLND` `GWETTOP`, 276 months, OPeNDAP) and compared 2003–2025 annual trends on GLDAS land cells.

- Per-cell trend maps: sign agreement on **61%** of land area (50% would be chance); correlation r = 0.32.
- Land area drying: GLDAS **69%**, MERRA-2 **42%**. Global land mean: GLDAS −0.46 kg/m²/decade (p < 0.001); MERRA-2 +0.006/decade (p = 0.13).

| Region | GLDAS (kg/m²/decade, p) | MERRA-2 (wetness/decade, p) | Same sign |
|---|---|---|---|
| Mediterranean | −0.83 (0.01) | −0.011 (0.06) | yes |
| Amazon | −0.59 (0.05) | −0.032 (0.07) | yes |
| N China | +0.68 (0.20) | +0.023 (0.10) | yes |
| Australia | −0.61 (0.27) | −0.018 (0.40) | yes |
| Sahel | −0.22 (0.11) | **+0.040 (< 0.001)** | no |
| Southern Africa | **−1.44 (0.005)** | +0.003 (0.79) | no |
| Central US | −0.65 (0.10) | +0.001 (0.98) | no |
| India | −0.04 (0.97) | +0.030 (0.09) | no |

**Verdict:** the global drying in GLDAS 2.1 is not confirmed and is probably a forcing artefact. MERRA-2's Sahel wetting matches the published Sahel rainfall recovery. Mediterranean and Amazon drying are supported by both. Soil moisture keeps its caution label, now naming the regions that agree.

## Phase 2 export: checks against published records (30 Oct 2026)

`web/public/data/validation.json`, written by `pipeline/td/export.py`. Regional checks need the expected sign and p < 0.05 (variance-corrected Mann-Kendall, yearly means 2003–2025).

| Check | Result | Ours | Reading |
|---|---|---|---|
| September Arctic sea ice vs NSIDC (−11.6 %/decade) | Pass | −11.56 | |
| Global temperature, MERRA-2 T2M vs GISTEMP v4 (Sen 0.275 °C/decade) | **Fail** | 0.206 (p = 0.22; plain MK 0.003) | MERRA-2 runs cooler than GISTEMP; T2M already carries a caution label. The autocorrelation correction is what removes significance |
| Haze: E China falls, Indo-Gangetic Plain rises | **Fail** (China) | E China −0.10/decade (p = 0.28); IGP +0.021 (p = 0.011) | Real, not a bug: China's AOD rose to ~2011 then fell steeply (≈ +0.11 → −0.12 anomaly). One straight-line trend over the whole record averages a rise-then-fall into "not proven". A good student lesson |
| Greening: China and India (Chen et al. 2019) | Pass | +0.029, +0.033 NDVI/decade | |
| Water loss: N India and California (Rodell et al. 2018) | **Fail** (California, borderline) | IGP −10.6 cm/decade (p = 0.007); Central Valley −13.8 (p = 0.053) | California's loss is larger than India's but interrupted by wet years (2017, 2019, 2023), so the test lands just above 0.05 |
| Global sea level rising | Pass | +34 mm/decade | |
| Stratosphere cooling, 10 hPa | Pass | −0.58 K/decade | |

The failing checks are kept as-is rather than tuned to pass: the app shows them so students can see when a straight-line test is the wrong tool.

## Land surface temperature: Terra → Aqua (30 Oct 2026)

The new "plot twist" check flagged LST falling ~3.7 K/decade after 2019 worldwide, while 2023–24 were record-hot years. Cause: Terra's orbit drift since 2020 (earlier, cooler daytime overpass). Switched to MYD11C3 (Aqua, 061); Terra kept in `data/interim/lst_terra*` for comparison.

| Region | Terra trend (p) | Aqua trend (p) | 2025 anomaly Terra → Aqua |
|---|---|---|---|
| Global land | +0.11 °C/decade (0.61) | **+0.24 (0.024)** | −1.77 → −0.52 |
| Arctic | +0.43 (0.011) | +0.55 (0.003) | +0.54 → +0.85 |
| Eastern China | +0.45 (0.24) | **+0.62 (0.004)** | −1.26 → +0.18 |
| Europe | +0.49 (0.051) | **+0.74 (0.001)** | −0.56 → +0.54 |
| Southeast Asia | +0.11 (0.82) | −0.01 (0.95) | −1.16 → −0.91 |

A smaller 2025 dip remains in the tropics (La Niña, or Aqua's own late-life drift), so LST keeps a caution label.
