"""Real trend maps and regional series for the web app (Phase 2), written through the data contract.

For each variable in data/interim/{var}.npz (monthly 0.5° grids, 2003–2025):
  A. monthly anomalies (td.stats.monthly_anomalies)
  B. one value per year for each season (td.stats.aggregate)
  C-E. per-cell Sen slope, corrected Mann-Kendall p, Benjamini–Hochberg q, SNR (td.stats.trend_field)
  F. regional series: cos(lat)-weighted box means of the yearly anomalies, with the same test (td.stats.series_stats)
Then the cross-variable files (contrasts, ranking, validation) and manifest.json, exactly as td.mock does,
so the app needs no changes when the mock is replaced.
"""

from __future__ import annotations

import json
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

from . import regions as R
from . import validate as V
from .colors import PALETTES, classes, ramp
from .contract import CONTRACT_VERSION, OVERLAY_BOUNDS, PLANES, grid_spec, lat_lon, to_mercator, write_grid, write_json
from .mock import catalogue
from .stats import aggregate, bh_fdr, monthly_anomalies, series_stats, trend_field

ROOT = Path(__file__).resolve().parents[2]
INTERIM = ROOT / "data" / "interim"
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"
ALPHA = 0.10
SEASONS = ("ANN", "DJF", "MAM", "JJA", "SON")
YEARS = np.arange(2003, 2026)

# Display settings for variables whose config has none (Tier 3), plus unit scaling for readable numbers.
DISPLAY = {
    "no2": {"palette": "haze", "trend_units": "10¹⁵ molecules/cm² per decade", "scale": 1e-15},
    "ozone": {"palette": "haze", "trend_units": "DU/decade"},
    "airs": {"palette": "warm", "trend_units": "°C/decade"},
    "chlor": {"palette": "wet", "trend_units": "mg/m³ per decade"},
    "sealevel": {"palette": "wet", "trend_units": "mm/decade", "scale": 1000.0},
}
# Variables where "% of the usual level" makes sense (positive quantities with a meaningful zero).
RELATIVE = {"precip", "ndvi", "aod", "no2", "chlor", "snow", "ozone"}
# Long-term mean range (variable's units, here %) a cell needs to be mapped. Below it the thing is never there (open
# ocean, snow-free tropics); above it it is always there (ice sheets). Either way the trend is a meaningless 0.
PRESENT_RANGE = {"seaice": (1.0, 99.0), "snow": (1.0, 99.0)}
# Model variables mapped only where an independent model agrees on the direction of change (data/interim/{partner}.npz):
# GLDAS soil moisture vs MERRA-2 topsoil wetness, which disagree on 39% of land.
AGREE_WITH = {"soil": "gwettop"}
# NSIDC's published September Arctic sea-ice trend (% per decade vs 1981–2010), for the validation check.
NSIDC_SEPT_PCT = -11.6


def config() -> dict:
    return yaml.safe_load(CONFIG.read_text(encoding="utf-8"))["variables"]


def _png(path: Path, rgba: np.ndarray, grid: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(to_mercator(rgba, grid), "RGBA").save(path, optimize=True)


def _box_mean(cube: np.ndarray, lats: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """cos(lat)-weighted mean over the masked, finite cells, for every leading index (year)."""
    w = np.cos(np.radians(lats))[:, None] * mask
    ok = np.isfinite(cube) & (w > 0)
    den = np.sum(ok * w, axis=(1, 2))
    num = np.sum(np.where(ok, cube, 0) * w, axis=(1, 2))
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan)


def region_series(full: np.ndarray, clim: np.ndarray, lats: np.ndarray, mask: np.ndarray, vid: str) -> tuple[np.ndarray, dict]:
    """One region's yearly series (box mean of the anomalies) and its trend stats, relative change where meaningful."""
    series = _box_mean(full, lats, mask)
    coslat = np.cos(np.radians(lats))[:, None]
    cm = mask & np.isfinite(clim)
    c = float(np.sum(np.where(cm, clim, 0) * coslat) / np.sum(cm * coslat)) if cm.any() else float("nan")
    return series, series_stats(series, YEARS, climatology=c if vid in RELATIVE and np.isfinite(c) and c > 0 else None)


def mask_absent(f: dict[str, np.ndarray], vid: str, clim: np.ndarray) -> dict[str, np.ndarray]:
    """Blank the cells where the quantity never changes because it is never there or always there (see PRESENT_RANGE).
    FDR is then recomputed over the cells that remain."""
    if vid not in PRESENT_RANGE:
        return f
    lo, hi = PRESENT_RANGE[vid]
    with np.errstate(invalid="ignore"):
        absent = ~((clim >= lo) & (clim <= hi))
    out = {k: np.where(absent, np.nan, a) for k, a in f.items()}
    out["q"] = bh_fdr(out["p"])
    return out


def mask_disagree(f: dict[str, np.ndarray], other: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Blank the cells where an independent dataset's trend has the opposite sign, is missing, or either is exactly
    flat (ice sheets, where neither model's soil ever changes); FDR is recomputed."""
    with np.errstate(invalid="ignore"):
        agree = (np.sign(f["slope"]) == np.sign(other["slope"])) & (f["slope"] != 0)
    out = {k: np.where(agree, a, np.nan) for k, a in f.items()}
    out["q"] = bh_fdr(out["p"])
    return out


def ranking_row(f: dict[str, np.ndarray], mask: np.ndarray, vid: str, stats: dict) -> dict | None:
    """Share of a region's cells with a significant (FDR) rise or fall; None if the region has no data."""
    sig = mask & np.isfinite(f["q"]) & (f["q"] <= ALPHA)
    total = int((mask & np.isfinite(f["slope"])).sum())
    if not total:
        return None
    return {
        "variable": vid,
        "pctRising": 100 * float((sig & (f["slope"] > 0)).sum()) / total,
        "pctFalling": 100 * float((sig & (f["slope"] < 0)).sum()) / total,
        "mixed": False,
        "regionalSnr": stats["snr"],
    }


def yearly_anomalies(vid: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Scaled monthly data's anomalies plus the year/month axes and the climatology, for one variable."""
    d = np.load(INTERIM / f"{vid}.npz")
    data = d["data"].astype(float) * DISPLAY.get(vid, {}).get("scale", 1.0)
    years = np.array([int(m[:4]) for m in d["months"]])
    months = np.array([int(m[5:7]) for m in d["months"]])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        clim = np.nanmean(data, axis=0)
    return monthly_anomalies(data, months), years, months, clim


def season_cube(anoms: np.ndarray, years: np.ndarray, months: np.ndarray, season: str) -> np.ndarray:
    """Seasonal (or annual) means padded to the full YEARS axis, so every season lines up (DJF has no 2003)."""
    yrs, annual = aggregate(anoms, years, months, season)
    full = np.full((YEARS.size,) + annual.shape[1:], np.nan)
    for i, y in enumerate(yrs):
        if YEARS[0] <= y <= YEARS[-1]:
            full[y - YEARS[0]] = annual[i]
    return full


def sig_layers(f: dict[str, np.ndarray], lats: np.ndarray, palette: str, out: Path, raw_path: str, grid: dict) -> dict:
    """Uncorrected layer (p <= ALPHA, no FDR) and the % of mapped area significant with and without FDR."""
    _png(out / raw_path, classes(f["slope"], f["p"], ALPHA, palette), grid)
    w = np.cos(np.radians(lats))[:, None] * np.isfinite(f["slope"])
    area = lambda x: round(100 * float(np.sum(w * np.nan_to_num(x <= ALPHA, nan=0)) / np.sum(w)), 1) if w.sum() else 0.0
    with np.errstate(invalid="ignore"):
        return {"raw": area(f["p"]), "fdr": area(f["q"])}


def export_variable(vid: str, v: dict, out: Path, grid: dict, seasons=SEASONS, n_jobs: int = -1) -> dict:
    """Trend layers, grids and regional series for one variable; returns its manifest entry plus contrast/ranking rows."""
    lats, lons = lat_lon(grid)
    disp = {**DISPLAY.get(vid, {}), **{k: v[k] for k in ("palette", "trend_units") if k in v}}
    anoms, years, months, clim = yearly_anomalies(vid)
    partner = yearly_anomalies(AGREE_WITH[vid]) if vid in AGREE_WITH else None

    palette = disp.get("palette", "warm")
    layers, region_rows, contrasts, ranking = {}, {b[0]: {"id": b[0], "seasons": {}} for b in R.BOXES}, [], {}
    vmax = None
    for season in seasons:
        t0 = time.time()
        full = season_cube(anoms, years, months, season)
        f = mask_absent(trend_field(full, YEARS, n_jobs=n_jobs), vid, clim)
        if partner is not None:
            f = mask_disagree(f, trend_field(season_cube(*partner[:3], season), YEARS, n_jobs=n_jobs))
        if vmax is None:  # one colour range per variable (from the first season), so seasons are comparable
            finite = np.abs(f["slope"][np.isfinite(f["slope"])])
            vmax = float(np.percentile(finite, 98)) if finite.size else 1.0
        gpath = f"grids/{vid}/{season}.bin"
        write_grid(out / gpath, f)
        layers[season] = {"slope": f"layers/{vid}/{season}/slope.png", "class": f"layers/{vid}/{season}/class.png", "grid": gpath}
        _png(out / layers[season]["slope"], ramp(f["slope"], -vmax, vmax, palette), grid)
        _png(out / layers[season]["class"], classes(f["slope"], f["q"], ALPHA, palette), grid)
        layers[season]["raw"] = f"layers/{vid}/{season}/raw.png"
        layers[season]["sigArea"] = sig_layers(f, lats, palette, out, layers[season]["raw"], grid)

        regional = []
        for rid, _, bbox in R.BOXES:
            m = R.box_mask(lats, lons, bbox)
            series, stats = region_series(full, clim, lats, m, vid)
            region_rows[rid]["seasons"][season] = {"values": series.tolist(), "stats": stats}
            row = ranking_row(f, m, vid, stats)
            if row:
                ranking.setdefault(rid, {}).setdefault(season, []).append(row)
            if rid != "glb" and stats["p"] is not None and stats["p"] < 0.05:
                regional.append((rid, stats))
        rising = [r for r in regional if r[1]["slopePerDecade"] > 0]
        falling = [r for r in regional if r[1]["slopePerDecade"] < 0]
        if rising and falling:
            pick = lambda r: {"region": r[0], "slopePerDecade": r[1]["slopePerDecade"], "snr": r[1]["snr"], "p": r[1]["p"]}  # noqa: E731
            top = max(rising, key=lambda r: r[1]["snr"] or 0)
            bot = min(falling, key=lambda r: r[1]["snr"] or 0)
            contrasts.append({"variable": vid, "season": season, "rising": pick(top), "falling": pick(bot), "featured": vid == "aod" and season == "ANN"})
        n_sig = int(np.sum(np.isfinite(f["q"]) & (f["q"] <= ALPHA)))
        print(f"  {vid} {season}: {time.time() - t0:.0f}s, {n_sig} significant cells", flush=True)

    write_json(out / f"regions/{vid}.json", {"variable": vid, "years": YEARS.tolist(), "regions": list(region_rows.values())}, "regions")
    entry = {
        "id": vid,
        "label": v["label"],
        "trendUnits": disp.get("trend_units", f"{v.get('units', '')}/decade"),
        "palette": PALETTES[palette],
        "colorRange": [-vmax, vmax],
        "layers": layers,
        "regions": f"regions/{vid}.json",
        "pixels": None,
        **({"caution": v["caution"]} if v.get("caution") else {}),
    }
    return {"entry": entry, "contrasts": contrasts, "ranking": ranking}


def _region_check(regions_dir: Path, vid: str, expect: dict[str, int], cid: str, name: str) -> dict:
    """Pass if every listed region's yearly trend has the expected sign and p < 0.05."""
    path = regions_dir / f"{vid}.json"
    if not path.exists():
        return {"id": cid, "name": name, "status": "pending"}
    rows = {r["id"]: r["seasons"]["ANN"]["stats"] for r in json.loads(path.read_text(encoding="utf-8"))["regions"]}
    parts, ok = [], True
    for rid, sign in expect.items():
        s = rows[rid]
        good = s["slopePerDecade"] is not None and np.sign(s["slopePerDecade"]) == sign and s["p"] is not None and s["p"] < 0.05
        ok &= bool(good)
        parts.append(f"{rid} {s['slopePerDecade']:+.3g}/decade (p={s['p']:.2g})" if s["slopePerDecade"] is not None else f"{rid} n/a")
    return {"id": cid, "name": name, "status": "pass" if ok else "fail", "note": "; ".join(parts)}


def finish_ranking(ranking: dict) -> None:
    """Flag regions with both strong rises and falls, and sort each list by share of significant change."""
    for rows in ranking.values():
        for items in rows.values():
            for it in items:
                it["mixed"] = it["pctRising"] > 10 and it["pctFalling"] > 10
            items.sort(key=lambda it: -(it["pctRising"] + it["pctFalling"]))


def write_validation(out: Path) -> None:
    """Validation: the two published-record checks, then sign checks on our own regional trends."""
    V.run(out / "validation.json", published_sea_ice_pct=NSIDC_SEPT_PCT)
    checks = [c for c in json.loads((out / "validation.json").read_text(encoding="utf-8"))["checks"] if c["id"] in ("sea-ice", "gistemp")]
    checks += [
        _region_check(out / "regions", "aod", {"eas": -1, "igp": +1}, "aod-signs", "Haze falls over eastern China, rises over the Indo-Gangetic Plain"),
        _region_check(out / "regions", "ndvi", {"eas": +1, "igp": +1}, "ndvi-signs", "Greening over China and India (Chen et al. 2019)"),
        _region_check(out / "regions", "tws", {"igp": -1, "cvy": -1}, "tws-signs", "Water loss in northern India and California (Rodell et al. 2018)"),
        _region_check(out / "regions", "sealevel", {"glb": +1}, "sealevel", "Global sea level rising"),
        _region_check(out / "regions", "airs", {"glb": -1}, "strat-cooling", "Stratosphere cooling at 10 hPa"),
    ]
    write_json(out / "validation.json", {"checks": checks}, "validation")


def export_all(out: Path, variables: list[str] | None = None, seasons=SEASONS, n_jobs: int = -1) -> dict:
    cfg = config()
    grid = grid_spec(0.5)
    vids = [k for k in cfg if (INTERIM / f"{k}.npz").exists() and (variables is None or k in variables)]
    entries, contrasts, ranking = [], [], {}
    for vid in vids:
        t0 = time.time()
        print(f"== {vid}", flush=True)
        r = export_variable(vid, cfg[vid], out, grid, seasons, n_jobs)
        entries.append(r["entry"])
        contrasts += r["contrasts"]
        for rid, by_season in r["ranking"].items():
            for season, items in by_season.items():
                ranking.setdefault(rid, {}).setdefault(season, []).extend(items)
        print(f"== {vid} done in {(time.time() - t0) / 60:.1f} min", flush=True)

    finish_ranking(ranking)

    write_json(out / "regions/index.json", R.index(), "regions-index")
    write_json(out / "contrasts.json", contrasts, "contrasts")
    write_json(out / "ranking.json", ranking, "ranking")

    write_validation(out)

    manifest = {
        "contractVersion": CONTRACT_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mock": False,
        "window": {"start": "2003-01", "end": "2025-12", "years": int(YEARS.size)},
        "grid": grid,
        "planes": list(PLANES),
        "seasons": list(seasons),
        "fdrAlpha": ALPHA,
        "overlayBounds": OVERLAY_BOUNDS,
        "variables": entries,
        "catalogue": [c for c in catalogue() if c["id"] not in vids],
        "files": {"contrasts": "contrasts.json", "ranking": "ranking.json", "validation": "validation.json", "regions": "regions/index.json"},
    }
    write_json(out / "manifest.json", manifest, "manifest")
    return manifest
