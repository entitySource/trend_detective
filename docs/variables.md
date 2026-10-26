# Variable catalogue and scope (15 variables, 3 tiers)

Decided 26 Oct 2026 from two ECC deep-research passes. Every product below was confirmed in NASA CMR on 26 Oct with `pipeline/scripts/check_datasets.py`. The config lives in `pipeline/config/variables.yaml`.

**Why 15:** the GCOS Essential Climate Variables are the reference set; the count of about 55 is unconfirmed. 15 is enough to cover all five parts of the Earth system with 2–4 variables each, without heavy repetition. **Scope rule: depth over breadth.** Tier 1 must be correct and validated before any Tier 2 work starts.

| Tier | # | Variable | Sphere | NASA product (version) | Opposite-direction story | Check our result against |
|---|---|---|---|---|---|---|
| 1 | 1 | Vegetation (NDVI) | Land | MOD13C2 (061) | China and India greening; parts of Alaska, Central Asia and Iran browning | Chen et al. 2019, *Nat. Sustain.* Fig. 1 |
| 1 | 2 | Total water storage | Hydrology | GRACE/GRACE-FO JPL mascon RL06.3 v4 | Drying in N India, the Middle East and California; wetting in the Okavango and N Great Plains | Rodell et al. 2018, *Nature* Fig. 1 |
| 1 | 3 | Haze (AOD) | Atmosphere | MYD08_M3 (6.1) | Falling in Europe and N America; rising in South Asia; China reverses after about 2008 | de Meij 2012; Gupta 2022 |
| 1 | 4 | Air temperature | Atmosphere | MERRA-2 M2TMNXSLV (5.12.4) | Warming almost everywhere; North Atlantic "warming hole" | GISTEMP v4 |
| 1 | 5 | Precipitation | Hydrology | GPM IMERG M (07, ends Sep 2025) | Wet gets wetter, dry gets drier (mostly not significant) | GPCP v2.3 |
| 2 | 6 | Land surface temperature | Land | MOD11C3 (061) | Arctic warming vs irrigated-land cooling* | MERRA-2 T2M |
| 2 | 7 | Snow cover | Cryosphere | MOD10CM (61) | Spring snow loss vs some autumn gains* | Rutgers Snow Lab |
| 2 | 8 | Soil moisture + ET | Hydrology | GLDAS_NOAH025_M (2.1) | Mediterranean drying vs Sahel wetting* | ESA CCI soil moisture |
| 2 | 9 | Sea ice | Cryosphere | NSIDC-0051 (2), polar grid | Arctic loss vs Antarctic gain until 2015 | Parkinson 2019, *PNAS*; NSIDC Sea Ice Index |
| 2 | 10 | Sea surface temperature | Ocean | MUR L4 (4.1), daily, very large | Warming vs cooler eastern Pacific and Southern Ocean | NOAA OISST |
| 3 | 11 | NO₂ | Atmosphere | OMNO2d (003), from Oct 2004 | US and EU falling vs India rising | Krotkov et al. 2016, *ACP* |
| 3 | 12 | Total ozone | Atmosphere | OMTO3e (003), from Oct 2004 | Antarctic recovery vs small mid-latitude decline | WMO Ozone Assessment 2022 |
| 3 | 13 | Upper-air temperature / CO₂ | Atmosphere | AIRS3STM (7.0) | Stratosphere cooling vs troposphere warming | NOAA Mauna Loa |
| 3 | 14 | Ocean chlorophyll | Ocean | MODISA_L3m_CHL (2022.0) | Subtropical gyres declining vs high latitudes rising | Cael et al. 2023, *Nature* |
| 3 | 15 | Sea level | Ocean | NASA_SSH_REF_SIMPLE_GRID_V1 | Global rise vs 1993–2012 eastern Pacific fall | PSMSL tide gauges |

\* Published-trend claim not yet checked against the paper (single source or from memory). Check it before quoting it in the app.

## Tiers, effort and deadlines

| Tier | Contents | Effort | Deadline |
|---|---|---|---|
| **1: must ship** | Variables 1–5, fully processed, significance-tested and validated | 3–5 days pipeline + about 2 days validation | **MVP live 8 Nov** (PLAN-02 Phase 2) |
| **2: if on schedule** | Variables 6–10 | LST, snow and GLDAS reuse the existing readers (about 0.5 day each). Sea ice needs a polar regrid (about 1.5 days). SST needs daily → monthly (about 2 days; use a monthly SST product if one exists) | Start only once Tier 1 validations pass; add as many as fit by the **12 Nov feature freeze** |
| **3: catalogue only** | Variables 11–15 | 1–2 days each (daily or 5-day files to aggregate, or short records) | Listed in the app as "catalogued, trend pending"; after the hackathon |

**Order to cut if behind:** drop all of Tier 2 before touching Tier 1. Inside Tier 1, cut precipitation first, then temperature, then haze. Vegetation plus water storage is the minimum demo.

## Rules forced by these products

- **Per-variable time window.** Each trend uses that variable's own record (for example OMI from Oct 2004) and shows a "window: YYYY–YYYY" badge. Comparisons between variables are greyed out when the windows differ. At least 10 years are required.
- **Gaps.**
  - GRACE: Jul 2017 to May 2018 are masked.
  - IMERG: Oct to Dec 2025 are missing.
  - Mann-Kendall plus Sen's slope run on annual means that have enough valid months.
- **One granule per month.** MYD08_M3 (277 files) and the mixed-period products need de-duplication or filtering.
- **Removed:** MERRA-2 GWETTOP. GLDAS soil moisture replaces it in Tier 2.
- **Considered and excluded:**
  - Burned area (MCD64CMQ): not in CMR.
  - SMAP: starts 2015.
  - MOD16 evapotranspiration and MCD15 leaf-area index: 8-day tiles.
  - OCO-2: covers 2014–2022 only.
