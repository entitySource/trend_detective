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

## Still to check (needs an Earthdata login)

Everyone needs a free Earthdata account. Approve the GES DISC and LP DAAC applications in your Earthdata profile. Then, for **one granule of each product**, confirm these 4 things in xarray:

1. The variable name.
2. The units: IMERG is expected in mm/hr, and MERRA-2 T2M in K.
3. The fill value and scale factor.
4. The file size, then multiply it by 276 to estimate the download time.

`MOD13C2` is HDF4. On Windows that needs `pyhdf`, or GDAL through conda. Check this first, because it's the most likely blocker.
