"""Synthetic outputs that follow the data contract, so the web app can be built before real data exists.

Each mock variable has a made-up but plausible trend pattern, including the "opposite story" cases
the app is built around (haze falling over eastern China while rising over the Indo-Gangetic Plain).
Every file is marked mock in manifest.json; none of these numbers are real.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import yaml
from PIL import Image
from scipy import ndimage
from scipy.stats import norm

from . import regions as R
from .colors import PALETTES, classes, ramp
from .contract import OVERLAY_BOUNDS, CONTRACT_VERSION, PLANES, grid_spec, lat_lon, to_mercator, write_grid, write_json
from .stats import bh_fdr, series_stats

YEARS = np.arange(2003, 2026)
ALPHA = 0.10


def _bump(lats, lons, lat0, lon0, rlat, rlon):
    return np.exp(-(((lats[:, None] - lat0) / rlat) ** 2) - (((lons[None, :] - lon0) / rlon) ** 2))


def _patterns(lats: np.ndarray, lons: np.ndarray) -> dict[str, np.ndarray]:
    """Trend per decade for each mock variable."""
    la = lats[:, None] * np.ones_like(lons)[None, :]
    lo = np.ones_like(lats)[:, None] * lons[None, :]
    return {
        "t2m": 0.15 + 0.6 * np.clip((la - 50) / 40, 0, 1) + 0.05 * np.cos(np.radians(lo)),
        # Water storage, shaped like Rodell et al. 2018: groundwater loss in N India, Middle East, California;
        # gains in the Okavango and northern Great Plains. GRACE is coarse, so the hot-spots are wide.
        "tws": -3.0 * _bump(lats, lons, 28, 77, 5, 7)
        - 2.0 * _bump(lats, lons, 33, 47, 6, 10)
        - 2.0 * _bump(lats, lons, 37, -120, 4, 4)
        + 2.0 * _bump(lats, lons, -19, 23, 5, 6)
        + 1.5 * _bump(lats, lons, 46, -100, 5, 8),
        "precip": 0.08 * np.cos(np.radians(la * 6)) * np.exp(-((la / 35) ** 2)),
        "ndvi": 0.015 * (_bump(lats, lons, 32, 112, 8, 10) + _bump(lats, lons, 24, 79, 6, 8))
        - 0.01 * _bump(lats, lons, 14, 10, 4, 25)
        - 0.006 * _bump(lats, lons, -8, -60, 6, 10),
        "aod": -0.08 * _bump(lats, lons, 33, 116, 6, 7) + 0.06 * _bump(lats, lons, 26, 82, 4, 7) - 0.02 * _bump(lats, lons, 48, 10, 8, 15),
    }


SIGMA = {"t2m": 0.12, "tws": 0.8, "precip": 0.05, "ndvi": 0.005, "aod": 0.015}
UNITS = {"t2m": "°C/decade", "tws": "cm/decade", "precip": "mm/day per decade", "ndvi": "NDVI/decade", "aod": "AOD/decade"}
LABELS = {"t2m": "Air temperature (2 m)", "tws": "Total water storage (GRACE)", "precip": "Precipitation", "ndvi": "Vegetation greenness (NDVI)", "aod": "Haze (aerosol optical depth)"}
PALETTE_OF = {"t2m": "warm", "tws": "wet", "precip": "wet", "ndvi": "wet", "aod": "haze"}
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"


def catalogue() -> list[dict]:
    """Tier 2/3 variables from config: listed in the app, trends not computed yet."""
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    return [
        {"id": k, "label": v["label"], "tier": v["tier"], "sphere": v["sphere"], "product": f"{v['product']} v{v['version']}", "note": v.get("note", "")}
        for k, v in cfg["variables"].items()
        if v["tier"] > 1
    ]
SEASON_GAIN = {"ANN": 1.0, "DJF": 1.3, "MAM": 0.9, "JJA": 0.8, "SON": 1.1}


def _noise(shape, rng, smooth=3.0):
    n = ndimage.gaussian_filter(rng.standard_normal(shape), smooth, mode=("nearest", "wrap"))
    return n / n.std()


def _png(path: Path, rgba: np.ndarray, grid: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(to_mercator(rgba, grid), "RGBA").save(path, optimize=True)


def generate(out: Path, seasons: tuple[str, ...] = ("ANN", "JJA"), deg: float = 0.5, seed: int = 2026) -> dict:
    rng = np.random.default_rng(seed)
    grid = grid_spec(deg)
    lats, lons = lat_lon(grid)
    patterns = _patterns(lats, lons)
    boxes = R.BOXES
    manifest_vars, contrasts, ranking = [], [], {b[0]: {} for b in boxes}

    for vid, base in patterns.items():
        sigma = SIGMA[vid] * (1 + 0.3 * np.abs(_noise(base.shape, rng)))
        layers, region_rows = {}, {b[0]: {"id": b[0], "seasons": {}} for b in boxes}
        vmax = 0.8 * float(np.nanmax(np.abs(base))) or 1.0  # mock hot-spots are small; a percentile would saturate them

        for season in seasons:
            slope = base * SEASON_GAIN[season] + 0.4 * SIGMA[vid] * _noise(base.shape, rng)
            p = 2 * norm.sf(np.abs(slope) / sigma)
            q = bh_fdr(p)
            snr = slope / (sigma * 2)
            gpath = f"grids/{vid}/{season}.bin"
            write_grid(out / gpath, {"slope": slope, "p": p, "q": q, "snr": snr})
            layers[season] = {
                "slope": f"layers/{vid}/{season}/slope.png",
                "class": f"layers/{vid}/{season}/class.png",
                "grid": gpath,
            }
            _png(out / layers[season]["slope"], ramp(slope, -vmax, vmax, PALETTE_OF[vid]), grid)
            _png(out / layers[season]["class"], classes(slope, q, ALPHA, PALETTE_OF[vid]), grid)

            regional = []
            for rid, _, bbox in boxes:
                m = R.box_mask(lats, lons, bbox)
                trend = R.area_mean(slope, lats, m)
                noise_sd = R.area_mean(sigma, lats, m) * 1.5
                values = trend / 10 * (YEARS - YEARS.mean()) + rng.normal(0, noise_sd, YEARS.size)
                stats = series_stats(values, YEARS)
                region_rows[rid]["seasons"][season] = {"values": values.tolist(), "stats": stats}
                sig = m & (q <= ALPHA)
                total = int(m.sum())
                ranking[rid].setdefault(season, []).append(
                    {
                        "variable": vid,
                        "pctRising": 100 * float((sig & (slope > 0)).sum()) / total,
                        "pctFalling": 100 * float((sig & (slope < 0)).sum()) / total,
                        "mixed": False,
                        "regionalSnr": stats["snr"],
                    }
                )
                if rid != "glb" and stats["p"] is not None and stats["p"] < 0.05:
                    regional.append((rid, stats))
            rising = [r for r in regional if r[1]["slopePerDecade"] > 0]
            falling = [r for r in regional if r[1]["slopePerDecade"] < 0]
            if rising and falling:
                top = max(rising, key=lambda r: r[1]["snr"])
                bot = min(falling, key=lambda r: r[1]["snr"])
                pick = lambda r: {"region": r[0], "slopePerDecade": r[1]["slopePerDecade"], "snr": r[1]["snr"], "p": r[1]["p"]}  # noqa: E731
                contrasts.append({"variable": vid, "season": season, "rising": pick(top), "falling": pick(bot), "featured": vid == "aod"})

        write_json(out / f"regions/{vid}.json", {"variable": vid, "years": YEARS.tolist(), "regions": list(region_rows.values())}, "regions")
        manifest_vars.append(
            {
                "id": vid,
                "label": LABELS[vid],
                "trendUnits": UNITS[vid],
                "palette": PALETTES[PALETTE_OF[vid]],
                "colorRange": [-vmax, vmax],
                "layers": layers,
                "regions": f"regions/{vid}.json",
                "pixels": None,
                "note": "MOCK DATA: synthetic pattern, not a real measurement.",
            }
        )

    for rows in ranking.values():
        for season, items in rows.items():
            for it in items:
                it["mixed"] = it["pctRising"] > 10 and it["pctFalling"] > 10
            items.sort(key=lambda it: -(it["pctRising"] + it["pctFalling"]))

    write_json(out / "regions/index.json", R.index(), "regions-index")
    write_json(out / "contrasts.json", contrasts, "contrasts")
    write_json(out / "ranking.json", ranking, "ranking")
    write_json(
        out / "validation.json",
        {
            "checks": [
                {"id": "sea-ice", "name": "September Arctic sea-ice trend vs NSIDC", "status": "pending", "units": "% per decade", "tolerance": 1, "note": "Runs in Phase 1 on the real G02135 CSV."},
                {"id": "gistemp", "name": "Global temperature trend vs GISTEMP v4", "status": "pending", "units": "°C/decade", "tolerance": 0.05},
                {"id": "aod-signs", "name": "Haze falls over eastern China, rises over the Indo-Gangetic Plain", "status": "pending"},
                {"id": "ndvi-signs", "name": "Greening over China and India", "status": "pending"},
            ]
        },
        "validation",
    )
    manifest = {
        "contractVersion": CONTRACT_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mock": True,
        "window": {"start": "2003-01", "end": "2025-12", "years": int(YEARS.size)},
        "grid": grid,
        "planes": list(PLANES),
        "seasons": list(seasons),
        "fdrAlpha": ALPHA,
        "overlayBounds": OVERLAY_BOUNDS,
        "variables": manifest_vars,
        "catalogue": catalogue(),
        "files": {"contrasts": "contrasts.json", "ranking": "ranking.json", "validation": "validation.json", "regions": "regions/index.json"},
    }
    write_json(out / "manifest.json", manifest, "manifest")
    return manifest
