# Trend Detective

Our NASA Space Apps 2026 entry for **Challenge 2: Be An Earth System Trend Detective**. Pick a NASA variable, a season and a place, and see what is changing, where, how much, and whether it is statistically significant. The tool corrects for autocorrelation and for testing thousands of map cells at once. Its hook is "same variable, opposite story": the same measure rising in one region and falling in another.

The plan is [`../PLAN-02-earth-trend-detective.md`](../PLAN-02-earth-trend-detective.md).

## Status: Phase 0 (setup), 25 Oct 2026

- [x] All 5 NASA products confirmed in CMR, with granule counts, and both validation CSVs reachable. See [`docs/datasets.md`](docs/datasets.md), including the 3 findings that change the plan.
- [x] Output data contract fixed. See [`docs/data-contract.md`](docs/data-contract.md).
- [x] Mock-data generator writes the full contract, so the web app can be built without real data.
- [x] Web app: MapLibre map with trend and significance overlays, a variable and season picker, and a click readout of slope, p, q and SNR.
- [ ] **Needs people:** Earthdata accounts, plus opening one real granule per product (see `docs/datasets.md` "Still to check").
- [ ] Phase 1: `fetch.py` / `preprocess.py`, the per-cell Hamed–Rao engine, and the sea-ice validation.

## Phase 2 (real trends), 30 Oct 2026

`pipeline/scripts/export.py` turns `data/interim/*.npz` into the app's data files for all 15 variables and 5 seasons. It takes about 85 minutes; NO2 and ozone are the slowest because their gappy cells take the per-cell path. `web/public/data` now holds **real NASA data** (316 MB; gitignored, so regenerate it with the command below). `scripts/make_mock.py` still works for UI work without the downloads.

How the statistics work, in plain language plus details, with all known caveats: [`docs/methods.md`](docs/methods.md).

Measured on the production build: the command center loads 422 kB, and the map view about 630 kB gzipped (the first overlay is 182 kB), within the plan's 3-second first-paint target on 4G. The 75 per-cell grids (4 MB each) load only when a map cell is clicked.

Stop the dev server before exporting. On Windows its file watcher blocks the final folder rename; if that happens, rename `web/public/data.building` to `data` by hand.

## Layout

```
pipeline/            Python: data → trend statistics → contract files
  config/variables.yaml   the 5 curated variables (product, version, variable, units)
  td/contract.py          output formats + JSON schemas (source of truth)
  td/stats.py             FDR, series trend stats (per-cell engine comes in Phase 1)
  td/mock.py              synthetic contract data
  td/colors.py, regions.py
  scripts/check_datasets.py   Day-1 CMR check (no login)
  scripts/make_mock.py        writes mock data into web/public/data
  tests/
web/                 Vite + React + TypeScript + MapLibre (static site)
docs/                datasets.md, data-contract.md
```

## Run it

```bash
cd pipeline
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m pytest
.venv/Scripts/python scripts/check_datasets.py
.venv/Scripts/python scripts/make_mock.py
.venv/Scripts/python scripts/run_all.py              # everything: fetch (resumable) + export real data
.venv/Scripts/python scripts/run_all.py --skip-fetch # recompute from data/interim only (~90 min)
.venv/Scripts/python scripts/add_regions.py          # after adding a site to td/regions.py: regional series only (minutes)
.venv/Scripts/python scripts/mask_absent.py          # re-blank never/always-present sea ice and snow cells in an existing export
.venv/Scripts/python scripts/reexport.py t2m soil   # re-export some variables in place, keeping the rest
```

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in web/dist (copy web/public/data alongside)
```

Deploy to GitHub Pages (pushes `web/dist` as one fresh commit on `gh-pages`; then Settings > Pages > branch `gh-pages`):

```bash
bash scripts/deploy_pages.sh
```

The full Phase 1 pipeline needs HDF4 and GDAL. Use `conda env create -f pipeline/environment.yml` for that.

## Significance method (Phase 1 decision)

The plan specified the Hamed–Rao modified Mann-Kendall test. A Monte Carlo check (`pipeline/tests/test_stats.py`) on 23-year series with lag-1 autocorrelation 0.5 and no real trend showed it barely corrects at this record length:

| Method | False alarms (target 5%) | Power, 1σ/decade trend |
|---|---|---|
| Plain Mann-Kendall | 21% | 82% |
| Hamed–Rao | 22% | 82% |
| Trend-free pre-whitening | 26% | 79% |
| Pre-whitening | 4% | 46% (0% on a 2σ/decade trend: it removes the trend itself) |
| **Variance-corrected (default)** | **8%** | **76%** |

**The default is the variance-corrected test** (`MK_METHOD = "vc"` in `td/stats.py`):
- It takes the lag-1 autocorrelation of the Sen-detrended series and bias-corrects it for short records.
- It then widens the Mann-Kendall variance by (1 + r₁)/(1 − r₁).
- The plain Mann-Kendall p is stored alongside, for the Methods page.

In the app, "not significant" means "not proven", not "no change".

## Validation (Phase 1)

`python scripts/validate.py` runs these checks on public CSVs, with no login needed:

| Check | Ours | Published | Result |
|---|---|---|---|
| September Arctic sea ice, 1979–2026 | −11.56 %/decade | −11.6 %/decade ([NSIDC, Sept 2026](https://nsidc.org/sea-ice-today/analyses/aint-no-sunshine-when-shes-gone)) | **Pass** (tolerance ±1 percentage point) |
| Global temperature, 2003–2025 | Our GISTEMP map: +0.275 °C/decade | GISTEMP v4: +0.275 °C/decade (Sen) | Pass (MERRA-2 gave 0.206 and failed) |

## Known issues
- **MapLibre's worker needs an explicit URL.** `web/src/main.tsx` sets it by importing the worker file as a plain asset. Without that, bundled builds can't find the worker and the map stays empty.
