"""Science checks against published records (PLAN-02 §3 "Validation").

V1 sea ice: September Arctic extent trend from NSIDC G02135, % per decade relative to the 1981–2010 mean
            (NSIDC's convention; least-squares slope), plus our Sen + corrected MK result for comparison.
V2 GISTEMP: global annual-mean trend 2003–2025 of our gridded air-temperature map (GISTEMP v4, regridded to 0.5°)
            against NASA's published GISTEMP global mean; MERRA-2's independent model trend is noted alongside.
"""

from __future__ import annotations

import csv
import io
import urllib.request
from pathlib import Path

import numpy as np
import yaml

from .contract import write_json
from .stats import series_stats

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"


def _download(url: str, name: str) -> str:
    """Fetch once into data/raw (gitignored), then reuse."""
    path = RAW / name
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r:
            path.write_bytes(r.read())
    return path.read_text(encoding="utf-8", errors="replace")


def parse_sea_ice(text: str) -> tuple[np.ndarray, np.ndarray]:
    rows = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in rows[0]]
    iy, ie = header.index("year"), header.index("extent")
    years, extent = [], []
    for r in rows[1:]:
        if len(r) <= ie:
            continue
        v = float(r[ie])
        years.append(int(r[iy]))
        extent.append(np.nan if v < 0 else v)  # -9999 marks missing
    return np.array(years), np.array(extent)


def sea_ice_trend(years: np.ndarray, extent: np.ndarray) -> dict:
    ok = np.isfinite(extent)
    base = extent[(years >= 1981) & (years <= 2010) & ok].mean()
    ols = np.polyfit(years[ok], extent[ok], 1)[0]
    ours = series_stats(extent, years)
    return {
        "olsPctPerDecade": 100 * ols * 10 / base,
        "senPctPerDecade": 100 * ours["slopePerDecade"] / base,
        "p": ours["p"],
        "baseline": base,
        "years": f"{years[ok].min()}-{years[ok].max()}",
    }


def parse_gistemp(text: str) -> tuple[np.ndarray, np.ndarray]:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("Year,"))
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))
    years, vals = [], []
    for row in reader:
        try:
            y, v = int(row["Year"]), float(row["J-D"])
        except (ValueError, TypeError):  # '***' for an incomplete year
            continue
        years.append(y)
        vals.append(v)
    return np.array(years), np.array(vals)


def gistemp_trend(years: np.ndarray, vals: np.ndarray, start: int = 2003, end: int = 2025) -> dict:
    sel = (years >= start) & (years <= end)
    s = series_stats(vals[sel], years[sel])
    return {"senPerDecade": s["slopePerDecade"], "olsPerDecade": np.polyfit(years[sel], vals[sel], 1)[0] * 10, "p": s["p"], "n": s["n"]}


def global_trend(name: str, start: int = 2003, end: int = 2025) -> dict | None:
    """Trend of the area-weighted global annual mean of data/interim/{name}.npz, if fetched."""
    path = ROOT / "data" / "interim" / f"{name}.npz"
    if not path.exists():
        return None
    from .fetch import LATS

    d = np.load(path)
    cube, years = d["data"], np.array([int(m[:4]) for m in d["months"]])
    w = np.cos(np.radians(LATS))[:, None] * np.ones(cube.shape[2])
    glob = np.array([np.nansum(f * w) / np.nansum(w * np.isfinite(f)) for f in cube])
    yrs = np.arange(start, end + 1)
    s = series_stats(np.array([glob[years == y].mean() for y in yrs]), yrs)
    return {"senPerDecade": s["slopePerDecade"], "p": s["p"], "pOriginal": s["pOriginal"]}


def run(out: Path, published_sea_ice_pct: float | None = None) -> dict:
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))["validation"]
    ice = sea_ice_trend(*parse_sea_ice(_download(cfg["sea_ice_september"], "N_09_extent_v4.0.csv")))
    gis = gistemp_trend(*parse_gistemp(_download(cfg["gistemp_global"], "GLB.Ts+dSST.csv")))

    if published_sea_ice_pct is None:
        ice_check = {"status": "pending", "note": f"Our OLS trend over {ice['years']}. Enter NSIDC's published September rate to compare (±1 pp)."}
    else:
        ok = abs(ice["olsPctPerDecade"] - published_sea_ice_pct) <= 1
        ice_check = {"status": "pass" if ok else "fail", "published": published_sea_ice_pct}
    ours, merra = global_trend("t2m"), global_trend("t2m_merra2")
    gis_note = f"GISTEMP Sen slope over {gis['n']} years (OLS {gis['olsPerDecade']:.3f})."
    if merra is not None:
        gis_note += f" Independent model MERRA-2: {merra['senPerDecade']:.3f} °C/decade (p={merra['p']:.3g})."
    if ours is None:
        gis_check = {"status": "pending", "note": gis_note + " Our value is added once the air-temperature grid is fetched."}
    else:
        ok = abs(ours["senPerDecade"] - gis["senPerDecade"]) <= 0.05
        gis_check = {"status": "pass" if ok else "fail", "ours": ours["senPerDecade"], "note": gis_note + f" Our map p={ours['p']:.3g}."}
    result = {
        "checks": [
            {
                "id": "sea-ice",
                "name": "September Arctic sea-ice trend vs NSIDC",
                "ours": ice["olsPctPerDecade"],
                "tolerance": 1,
                "units": "% per decade (vs 1981-2010 mean)",
                **ice_check,
            },
            {
                "id": "gistemp",
                "name": "Global temperature trend 2003-2025: our air-temperature map vs NASA GISTEMP v4",
                "published": gis["senPerDecade"],
                "tolerance": 0.05,
                "units": "°C/decade",
                **gis_check,
            },
            {"id": "aod-signs", "name": "Haze falls over eastern China, rises over the Indo-Gangetic Plain", "status": "pending"},
            {"id": "ndvi-signs", "name": "Greening over China and India (Chen et al. 2019)", "status": "pending"},
            {"id": "tws-signs", "name": "Water-storage hot-spots match Rodell et al. 2018", "status": "pending"},
        ]
    }
    write_json(out, result, "validation")
    return {"seaIce": ice, "gistemp": gis}
