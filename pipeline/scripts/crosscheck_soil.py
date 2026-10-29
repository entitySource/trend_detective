"""Cross-check GLDAS 2.1 topsoil moisture trends against MERRA-2 topsoil wetness (GWETTOP).

    python scripts/crosscheck_soil.py      # fetches GWETTOP once (cached in data/interim/gwettop), then compares
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import earthaccess
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from td.fetch import INTERIM, LATS, LONS, _merra, assemble, config, fetch_opendap, month_keys  # noqa: E402
from td.stats import series_stats  # noqa: E402

GWET = {"product": "M2TMNXLND", "version": "5.12.4", "var": "GWETTOP"}
YEARS = np.arange(2003, 2026)
REGIONS = {  # name: (north, south, west, east)
    "Global land (60S-75N)": (75, -60, -180, 180),
    "Mediterranean": (45, 35, -10, 40),
    "Amazon": (5, -15, -75, -45),
    "Sahel": (18, 10, -15, 35),
    "Central US": (45, 32, -105, -90),
    "India": (30, 10, 70, 88),
    "N China": (42, 32, 105, 120),
    "Australia": (-15, -35, 115, 150),
    "S Africa": (-15, -32, 15, 35),
}


def annual(name: str) -> np.ndarray:
    d = np.load(INTERIM / f"{name}.npz")
    yrs = np.array([int(m[:4]) for m in d["months"]])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.stack([np.nanmean(d["data"][yrs == y], axis=0) for y in YEARS])


def ols_slope(cube: np.ndarray) -> np.ndarray:
    t = YEARS - YEARS.mean()
    return np.tensordot(t, cube - cube.mean(axis=0), axes=1) / (t**2).sum() * 10


def box_series(cube: np.ndarray, n, s, w, e) -> np.ndarray:
    la, lo = (LATS <= n) & (LATS >= s), (LONS >= w) & (LONS <= e)
    sub = cube[:, la][:, :, lo]
    wt = np.cos(np.radians(LATS[la]))[:, None] * np.ones(lo.sum())
    ok = np.isfinite(sub)
    return np.nansum(sub * wt, axis=(1, 2)) / np.sum(ok * wt, axis=(1, 2))


if __name__ == "__main__":
    if not (INTERIM / "gwettop.npz").exists():
        earthaccess.login(strategy="netrc")
        cfg = config()
        fetch_opendap("gwettop", GWET, month_keys(cfg["window"]["start"], cfg["window"]["end"]), "/GWETTOP;/lat;/lon", _merra)
        assemble("gwettop")

    gl, mr = annual("soil"), annual("gwettop")
    mr = np.where(np.isfinite(gl[0]), mr, np.nan)  # compare on GLDAS land cells only
    sg, sm = ols_slope(gl), ols_slope(mr)
    ok = np.isfinite(sg) & np.isfinite(sm)
    w = np.cos(np.radians(LATS))[:, None] * np.ones(len(LONS))
    agree = np.sum(w[ok] * (np.sign(sg[ok]) == np.sign(sm[ok]))) / np.sum(w[ok])
    r = np.corrcoef(sg[ok], sm[ok])[0, 1]
    print(f"Per-cell trend maps: area-weighted sign agreement {100 * agree:.0f}%, correlation r = {r:.2f}, cells {ok.sum()}")
    dry_g = np.sum(w[ok] * (sg[ok] < 0)) / np.sum(w[ok])
    dry_m = np.sum(w[ok] * (sm[ok] < 0)) / np.sum(w[ok])
    print(f"Land area drying: GLDAS {100 * dry_g:.0f}%, MERRA-2 {100 * dry_m:.0f}%")
    print(f"{'Region':24} {'GLDAS kg/m2/dec':>16} {'p':>7}   {'MERRA-2 /dec':>13} {'p':>7}  agree")
    for name, b in REGIONS.items():
        a, m = series_stats(box_series(gl, *b), YEARS), series_stats(box_series(mr, *b), YEARS)
        same = np.sign(a["slopePerDecade"]) == np.sign(m["slopePerDecade"])
        print(f"{name:24} {a['slopePerDecade']:+16.3f} {a['p']:7.3f}   {m['slopePerDecade']:+13.4f} {m['p']:7.3f}  {'yes' if same else 'NO'}")
