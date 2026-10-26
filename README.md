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

Everything in `web/public/data` is currently **mock data**. The app says so in a banner.

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
```

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in web/dist (copy web/public/data alongside)
```

The full Phase 1 pipeline needs HDF4 and GDAL. Use `conda env create -f pipeline/environment.yml` for that.

## Known issues

- **Hamed–Rao can return NaN.** `pymannkendall.hamed_rao_modification_test` sometimes gives NaN on short series, because the variance correction goes negative. The mock just drops those regions. Phase 1 must decide how to handle it: cap the correction, or fall back to pre-whitening.
- **MapLibre's worker needs an explicit URL.** `web/src/main.tsx` sets it by importing the worker file as a plain asset. Without that, bundled builds can't find the worker and the map stays empty.
