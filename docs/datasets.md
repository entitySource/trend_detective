# Datasets: Phase 0 check

Checked on **25 Oct 2026** against NASA's public CMR catalogue (no login), using `pipeline/scripts/check_datasets.py`. Rerun it any time.

Analysis window: Jan 2003 – Dec 2025 = **276 months**.

| Variable | Product | Version | CMR collection | Coverage | Granules in window | Status |
|---|---|---|---|---|---|---|
| Air temperature | MERRA-2 `M2TMNXSLV` (var `T2M`) | 5.12.4 | C1276812859-GES_DISC | 1980 → present | 276 | OK |
| Topsoil wetness | MERRA-2 `M2TMNXLND` (var `GWETTOP`) | 5.12.4 | C1276812856-GES_DISC | 1980 → present | 276 | OK |
| Precipitation | GPM IMERG Final `GPM_3IMERGM` | 07 | C2723754851-GES_DISC | 1998 → **2025-09-30** | **273** | Ends Sep 2025 |
| Vegetation (NDVI) | MODIS Terra `MOD13C2` | 061 | C2565788914-LPCLOUD | 2000-02 → present | 276 | OK |
| Haze (AOD) | MODIS Aqua `MYD08_M3` | **6.1** | C1443775657-LAADS | 2002-07 → present | **277** | Version fixed; one extra granule |

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
| Haze (MYD08_M3) | **368 MB** (1,144 variables) | **≈102 GB** | 180 × 360 (1°) | unitless; fill −9999; **value = raw × 0.001** | Biggest download by far: process-and-delete, or subset (see below) |
| Air temperature (MERRA-2) | 79 MB (94 variables) | **22 GB** | (1, 361, 576), 0.5° × 0.625° | K; fill 1e15 | Request only T2M through GES DISC's subsetting (OPeNDAP), so each file is about 1 MB |
| Precipitation (IMERG) | 19 MB | **5.3 GB** | (1, **3600 lon**, 1800 lat), 0.1° | mm/hr; fill −9999.9 | **Transpose to (lat, lon)**; × 24 for mm/day; fields sit in the `Grid` group |

**Gotchas found**

1. **MYD08_M3 is the main cost.**
   - **The problem:** it's about 102 GB for one variable, which is roughly 5 hours at 50 Mbps, and each file needs about 0.4 GB of free space while it's processed.
   - **Option A (keep MODIS):** download, extract AOD, delete each file, and run it overnight.
   - **Option B:** switch to MERRA-2 aerosol `M2TMNXAER` `TOTEXTTAU`. That's model data rather than satellite data, but tiny through subsetting.
   - **Team decision needed.**
2. **IMERG is stored longitude-first.** Transpose it, or every map will be rotated.
3. **Searching by month can return the previous month's MYD08 file.** A July 2015 search returned the June file (day-of-year 152). The fetch step must match on each file's start date.
4. **GRACE now runs to Jul 2026.** Trends still use the common 2003–2025 window.

The sample files are in `data/raw/sample/`, about 620 MB and gitignored. Delete them whenever you like.
