"""Download Tier 1 datasets and put every month on the common 0.5° grid (north→south, −180→180).

Each finished month is cached as data/interim/{var}/YYYY-MM.npy, so a stopped run resumes where it left off.
`assemble` stacks the cache into data/interim/{var}.npz for the trend engine.

Routes (docs/datasets.md):
  t2m, aod  MERRA-2 via cloud OPeNDAP, requesting one variable (~0.7 MB/month)
  precip    IMERG HDF5, downloaded then deleted; stored lon-first, so transposed
  ndvi      MOD13C2 HDF4, downloaded then deleted; 0.05° → 0.5° by 10×10 mean
  tws       GRACE/GRACE-FO mascons, one file holding every month
"""

from __future__ import annotations

import shutil
import tempfile
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import earthaccess
import numpy as np
import xarray as xr
import yaml
from scipy.interpolate import RegularGridInterpolator

from .contract import grid_spec, lat_lon

ROOT = Path(__file__).resolve().parents[2]
INTERIM = ROOT / "data" / "interim"
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"
GRID = grid_spec(0.5)
LATS, LONS = lat_lon(GRID)  # 89.75 → −89.75, −179.75 → 179.75


def config() -> dict:
    return yaml.safe_load(CONFIG.read_text(encoding="utf-8"))


def month_keys(start: str, end: str) -> list[str]:
    (y0, m0), (y1, m1) = (map(int, s.split("-")) for s in (start, end))
    return [f"{y:04d}-{m:02d}" for y in range(y0, y1 + 1) for m in range(1, 13) if (y0, m0) <= (y, m) <= (y1, m1)]


# ---------- Regridding to 0.5° (pure functions, unit-tested) ----------

def coarsen_mean(a: np.ndarray, f: int) -> np.ndarray:
    h, w = a.shape
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN blocks stay NaN
        return np.nanmean(a.reshape(h // f, f, w // f, f), axis=(1, 3))


def merra_to_half(field: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Bilinear from MERRA-2's 0.5°×0.625° grid (lat −90→90, lon −180→179.375), wrapping at the date line."""
    lon_ext = np.append(lon, lon[0] + 360)
    f_ext = np.concatenate([field, field[:, :1]], axis=1)
    interp = RegularGridInterpolator((lat, lon_ext), f_ext, bounds_error=False, fill_value=np.nan)
    la, lo = np.meshgrid(LATS, LONS, indexing="ij")
    return interp(np.stack([la, lo], axis=-1))


def imerg_to_half(precip_lon_lat: np.ndarray) -> np.ndarray:
    """IMERG (3600 lon, 1800 lat; lat south→north) in mm/hr → (360, 720) north→south in mm/day."""
    a = precip_lon_lat.T[::-1]
    return coarsen_mean(a, 5) * 24


def ndvi_to_half(raw: np.ndarray, fill: float = -3000, scale: float = 10000) -> np.ndarray:
    """MOD13C2 CMG (3600, 7200), already north→south from −180, stored as NDVI × 10000."""
    v = np.where(raw == fill, np.nan, raw / scale)
    return coarsen_mean(v, 10)


def grace_to_half(field_lat_lon: np.ndarray) -> np.ndarray:
    """GRACE mascon grid (lat south→north, lon 0→360) → north→south, −180→180."""
    return np.roll(field_lat_lon[::-1], 360, axis=1)


# ---------- Cache ----------

def _cache(var: str) -> Path:
    p = INTERIM / var
    p.mkdir(parents=True, exist_ok=True)
    return p


def _save(var: str, key: str, field: np.ndarray) -> None:
    np.save(_cache(var) / f"{key}.npy", field.astype("float32"))


def _done(var: str) -> set[str]:
    return {p.stem for p in _cache(var).glob("*.npy")}


def _granule_month(g) -> str:
    begin = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    return begin[:7]


def _granules(v: dict, keys: list[str]) -> dict[str, object]:
    """One granule per month, matched on its start date (searches can return the neighbouring month)."""
    found = earthaccess.search_data(short_name=v["product"], version=v["version"], temporal=(f"{keys[0]}-01", f"{keys[-1]}-28"))
    by_month: dict[str, object] = {}
    for g in found:
        k = _granule_month(g)
        if k in keys and k not in by_month:
            by_month[k] = g
    return by_month


# ---------- Routes ----------

def _opendap_url(g, var: str) -> str:
    url = next(u["URL"] for u in g["umm"]["RelatedUrls"] if u.get("Subtype") == "OPENDAP DATA")
    return f"{url}.dap.nc4?dap4.ce=/{var};/lat;/lon"


def _fetch_opendap_month(session, g, var: str, key: str, name: str) -> str:
    r = session.get(_opendap_url(g, var), timeout=120)
    r.raise_for_status()
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "subset.nc4"
        path.write_bytes(r.content)
        with xr.open_dataset(path) as ds:
            field = ds[var].values[0].astype(float)
            _save(name, key, merra_to_half(field, ds["lat"].values, ds["lon"].values))
    return key


def fetch_opendap(name: str, v: dict, keys: list[str], workers: int = 6) -> None:
    todo = {k: g for k, g in _granules(v, keys).items() if k not in _done(name)}
    session = earthaccess.get_requests_https_session()
    with ThreadPoolExecutor(workers) as pool:
        jobs = [pool.submit(_fetch_opendap_month, session, g, v["var"], k, name) for k, g in todo.items()]
        for i, job in enumerate(as_completed(jobs), 1):
            job.result()
            if i % 24 == 0:
                print(f"  {name}: {i}/{len(jobs)} months", flush=True)


def _read_imerg(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path, engine="h5netcdf", group="Grid", decode_times=False) as ds:
        return imerg_to_half(ds[var].values[0].astype(float))


def _read_ndvi(path: Path, var: str) -> np.ndarray:
    from pyhdf.SD import SD, SDC

    sd = SD(str(path), SDC.READ)
    try:
        return ndvi_to_half(sd.select(var).get().astype(float))
    finally:
        sd.end()


def fetch_files(name: str, v: dict, keys: list[str], reader, batch: int = 4) -> None:
    """Download a few files at a time, reduce each to 0.5°, delete the originals."""
    todo = sorted((k, g) for k, g in _granules(v, keys).items() if k not in _done(name))
    for i in range(0, len(todo), batch):
        chunk = todo[i : i + batch]
        tmp = Path(tempfile.mkdtemp(prefix=f"td-{name}-"))
        try:
            paths = earthaccess.download([g for _, g in chunk], local_path=str(tmp), show_progress=False)
            for (k, _), p in zip(chunk, sorted(paths, key=lambda s: Path(s).name)):
                _save(name, k, reader(Path(p), v["var"]))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        print(f"  {name}: {min(i + batch, len(todo))}/{len(todo)} months", flush=True)


def fetch_grace(name: str, v: dict, keys: list[str]) -> None:
    results = earthaccess.search_data(short_name=v["product"], version=v["version"], count=1)
    tmp = Path(tempfile.mkdtemp(prefix="td-grace-"))
    try:
        path = Path(earthaccess.download(results[:1], local_path=str(tmp), show_progress=False)[0])
        with xr.open_dataset(path) as ds:
            land = grace_to_half(ds["land_mask"].values.astype(float)) > 0
            months = np.array([str(t)[:7] for t in ds["time"].values])
            data = ds[v["var"]].values.astype(float)
        for k in keys:
            sel = months == k
            if sel.any():  # a few GRACE months straddle two calendar months; average what lands in each
                field = grace_to_half(data[sel].mean(axis=0))
                _save(name, k, np.where(land, field, np.nan))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


ROUTES = {
    "opendap": fetch_opendap,
    "imerg": lambda n, v, k: fetch_files(n, v, k, _read_imerg),
    "ndvi": lambda n, v, k: fetch_files(n, v, k, _read_ndvi),
    "grace": fetch_grace,
}
ROUTE_OF = {"t2m": "opendap", "aod": "opendap", "precip": "imerg", "ndvi": "ndvi", "tws": "grace"}


def fetch(name: str) -> None:
    cfg = config()
    keys = month_keys(cfg["window"]["start"], cfg["window"]["end"])
    if not earthaccess.login(strategy="netrc").authenticated:
        raise SystemExit("Not logged in to Earthdata: see docs/datasets.md")
    ROUTES[ROUTE_OF[name]](name, cfg["variables"][name], keys)


def assemble(name: str) -> Path:
    """Stack cached months into (time, 360, 720); missing months are NaN."""
    cfg = config()
    keys = month_keys(cfg["window"]["start"], cfg["window"]["end"])
    cube = np.full((len(keys), GRID["nlat"], GRID["nlon"]), np.nan, dtype="float32")
    have = _done(name)
    for i, k in enumerate(keys):
        if k in have:
            cube[i] = np.load(_cache(name) / f"{k}.npy")
    out = INTERIM / f"{name}.npz"
    np.savez_compressed(out, data=cube, months=np.array(keys))
    return out
