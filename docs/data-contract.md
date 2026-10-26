# Data contract: pipeline → web app

Fixed on **25 Oct 2026** (contract version 1), so the front-end and the pipeline can be built in parallel.

**Where the rules live:**
- `pipeline/td/contract.py` (writers + JSON schemas) is the source of truth.
- `web/src/contract.ts` mirrors it in TypeScript.
- `pipeline/td/mock.py` writes a complete fake data set that passes every schema, using `python scripts/make_mock.py`.

All paths are relative to `web/public/data/`.

| File | Format | What's in it |
|---|---|---|
| `manifest.json` | JSON | The index: window, grid, seasons, FDR α, overlay bounds, and per-variable labels, units, palette, colour range and file paths. `mock: true` marks fake data. |
| `layers/{var}/{season}/slope.png` | RGBA PNG, Web Mercator ±85.0511° | Trend per decade, coloured with the variable's palette. NaN is transparent. |
| `layers/{var}/{season}/class.png` | RGBA PNG, Web Mercator | Significant rise, significant fall, or not significant (faint grey), using the FDR q ≤ α. |
| `grids/{var}/{season}.bin` | Float32 little-endian | 4 planes in order `slope, p, q, snr`, each `nlat × nlon` row-major, north→south, west→east (0.5° → 360 × 720 → 4.1 MB). NaN means no data. |
| `pixels/{var}/{tile}.bin` | Int16 little-endian | Optional; Phase 2. Monthly anomalies for a 10° tile at 1°: `(100 cells × months)`, value = int × `scale` + `offset`, −32768 = missing. Tile names look like `n30e070` (north-west corner). |
| `regions/index.json` | JSON | Region ids, names and bounding boxes. |
| `regions/{var}.json` | JSON | Per region and season: annual values for each year, plus stats (`slopePerDecade`, `ciLow`, `ciHigh`, `p`, `pOriginal`, `snr`, `totalChange`, `relChange`, `n`). |
| `contrasts.json` | JSON | "Same variable, opposite story" pairs: the strongest significant rising and falling region per variable and season. |
| `ranking.json` | JSON | `region → season → [variables]`: % of area significantly rising or falling, a `mixed` flag, and the regional SNR. |
| `validation.json` | JSON | Each check has a status of `pass`, `fail` or `pending`, plus our value, the published value and the tolerance. |

## Conventions

- **Cell lookup:**
  - `row = round((lat0 − lat) / |dlat| − 0.5)`
  - `col = round((lon − lon0) / dlon − 0.5)`
  - Implemented and tested in `web/src/lib/grid.ts` and `pipeline/td/contract.py`.
- **Missing values:** JSON has no NaN, so the writers turn NaN and ∞ into `null`.
- **Overlay projection:** PNGs are reprojected to Web Mercator by a row lookup (`mercator_rows`). MapLibre shows them as an image source using `overlayBounds`.
- **Size budget:** the whole data set must stay under 300 MB, and the first page load under 3 MB.
  - Grids are fetched only when the user clicks the map.
  - The mock with 5 variables × 2 seasons is 45 MB.
  - All 5 seasons would be about 110 MB.
