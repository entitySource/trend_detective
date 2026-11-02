"""Download Tier 1 datasets and put every month on the common 0.5° grid (north→south, −180→180).

Each finished month is cached as data/interim/{var}/YYYY-MM.npy, so a stopped run resumes where it left off.
`assemble` stacks the cache into data/interim/{var}.npz for the trend engine.

Routes (docs/datasets.md), one per variable in ROUTE_OF:
  t2m       NASA GISTEMP v4 gridded anomalies (thermometers), one public file, 2° → 0.5° bilinear
  aod       MERRA-2 via cloud OPeNDAP, requesting one variable (~0.7 MB/month)
  precip    IMERG HDF5, downloaded then deleted; stored lon-first, so transposed
  ndvi      MOD13C2 HDF4, downloaded then deleted; 0.05° → 0.5° by 10×10 mean
  tws       GRACE/GRACE-FO mascons, one file holding every month
"""

from __future__ import annotations

import shutil
import tempfile
import time
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


def gistemp_to_half(field: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Bilinear from GISTEMP's 2° grid (lat −89→89, lon −179→179), wrapping at the date line; the 1° polar
    rims beyond ±89° take the nearest row. Gaps (NaN) stay gaps."""
    lon_ext = np.concatenate([[lon[-1] - 360], lon, [lon[0] + 360]])
    f_ext = np.concatenate([field[:, -1:], field, field[:, :1]], axis=1)
    interp = RegularGridInterpolator((lat, lon_ext), f_ext, bounds_error=False, fill_value=np.nan)
    la, lo = np.meshgrid(np.clip(LATS, lat.min(), lat.max()), LONS, indexing="ij")
    return interp(np.stack([la, lo], axis=-1))


def omps_to_half(o3: np.ndarray) -> np.ndarray:
    """OMPS NM L3 total ozone (180, 360) at 1°, latitude south→north, fill −1.27e30 → (360, 720) north→south."""
    a = np.where(o3 > 0, o3, np.nan)[::-1]
    return np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)


def cci_to_half(sm: np.ndarray) -> np.ndarray:
    """ESA CCI soil moisture (720, 1440) at 0.25°, already north→south from −180, NaN where flagged → 0.5° mean."""
    return coarsen_mean(sm, 2)


def imerg_to_half(precip_lon_lat: np.ndarray) -> np.ndarray:
    """IMERG (3600 lon, 1800 lat; lat south→north) in mm/hr → (360, 720) north→south in mm/day."""
    a = precip_lon_lat.T[::-1]
    return coarsen_mean(a, 5) * 24


def ndvi_to_half(raw: np.ndarray, fill: float = -3000, scale: float = 10000) -> np.ndarray:
    """MOD13C2 CMG (3600, 7200), already north→south from −180, stored as NDVI × 10000."""
    v = np.where(raw == fill, np.nan, raw / scale)
    return coarsen_mean(v, 10)


def grace_to_half(field_lat_lon: np.ndarray) -> np.ndarray:
    """GRACE mascon grid (lat south→north, lon 0→360) → north→south, −180→180. Also fits NASA-SSH sea level."""
    return np.roll(field_lat_lon[::-1], 360, axis=1)


def cmg_to_half(raw: np.ndarray, scale: float = 1.0, valid: tuple[float, float] = (-np.inf, np.inf)) -> np.ndarray:
    """MODIS 0.05° CMG (LST, snow), north→south from −180; raw values outside `valid` are fill or flags."""
    v = np.where((raw >= valid[0]) & (raw <= valid[1]), raw * scale, np.nan)
    return coarsen_mean(v, 10)


def gldas_to_half(field: np.ndarray) -> np.ndarray:
    """GLDAS 0.25° (600 lat from −59.875 south→north, 1440 lon) → 0.5°; Antarctica rows stay NaN."""
    top = coarsen_mean(field, 2)[::-1]
    return np.vstack([top, np.full((GRID["nlat"] - top.shape[0], GRID["nlon"]), np.nan)])


def omi_to_half(field: np.ndarray) -> np.ndarray:
    """OMI L3e/L3d 0.25° (720, 1440), south→north; fill is −1.27e30."""
    return coarsen_mean(np.where(field < -1e29, np.nan, field)[::-1], 2)


def airs_to_half(field: np.ndarray) -> np.ndarray:
    """AIRS 1° (180, 360), already north→south from −180: each cell becomes 2×2."""
    f = np.where(field == -9999, np.nan, field)
    return np.repeat(np.repeat(f, 2, axis=0), 2, axis=1)


def l3m9km_to_half(field: np.ndarray) -> np.ndarray:
    """Ocean-colour L3 mapped 9 km (2160, 4320), north→south from −180 (SST, chlorophyll)."""
    return coarsen_mean(field, 6)


# Hughes 1980 ellipsoid, NSIDC polar stereographic (EPSG:3411 north, 3412 south), true scale at ±70°.
_A, _E = 6378273.0, 0.081816153


def polar_xy(lat: np.ndarray, lon: np.ndarray, south: bool) -> tuple[np.ndarray, np.ndarray]:
    """Forward projection (Snyder 1987, eq. 21-33/21-34) for the sea-ice grids."""
    lon0 = 0.0 if south else -45.0
    if south:
        lat, lon, lon0 = -lat, -lon, -lon0
    phi, phic = np.radians(lat), np.radians(70.0)

    def t(p):
        return np.tan(np.pi / 4 - p / 2) / ((1 - _E * np.sin(p)) / (1 + _E * np.sin(p))) ** (_E / 2)

    mc = np.cos(phic) / np.sqrt(1 - _E**2 * np.sin(phic) ** 2)
    rho = _A * mc * t(phi) / t(phic)
    dl = np.radians(lon - lon0)
    x, y = rho * np.sin(dl), -rho * np.cos(dl)
    return (-x, -y) if south else (x, y)


def polar_to_half(conc: np.ndarray, x: np.ndarray, y: np.ndarray, south: bool) -> np.ndarray:
    """Nearest 25 km cell for every 0.5° cell in that hemisphere; flags (land, coast, pole hole) → NaN; fraction → %."""
    la, lo = np.meshgrid(LATS, LONS, indexing="ij")
    out = np.full(la.shape, np.nan)
    hemi = la < 0 if south else la > 0
    px, py = polar_xy(la[hemi], lo[hemi], south)
    dx, dy = x[1] - x[0], y[1] - y[0]
    ix, iy = np.round((px - x[0]) / dx).astype(int), np.round((py - y[0]) / dy).astype(int)
    inside = (ix >= 0) & (ix < len(x)) & (iy >= 0) & (iy < len(y))
    vals = np.full(px.shape, np.nan)
    vals[inside] = conc[iy[inside], ix[inside]]
    out[hemi] = np.where((vals >= 0) & (vals <= 1), vals * 100, np.nan)
    return out


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


def _search(v: dict, keys: list[str]) -> list:
    kw = {"short_name": v["product"], "temporal": (f"{keys[0]}-01", f"{keys[-1]}-28")}
    if v.get("version"):
        kw["version"] = v["version"]
    if v.get("granule_name"):  # e.g. only the monthly 9 km chlorophyll files
        kw["granule_name"] = v["granule_name"]
    return earthaccess.search_data(**kw)


def _granules(v: dict, keys: list[str]) -> dict[str, object]:
    """One granule per month, matched on its start date (searches can return the neighbouring month)."""
    by_month: dict[str, object] = {}
    for g in _search(v, keys):
        k = _granule_month(g)
        if k in keys and k not in by_month:
            by_month[k] = g
    return by_month


def _grouped(v: dict, keys: list[str], pattern: str) -> dict[str, list]:
    """Several granules per month (daily, weekly or per-hemisphere files), grouped by the date in the file name.

    `pattern` captures year and month; files it doesn't match (e.g. daily sea-ice files) are skipped.
    """
    import re

    by_month: dict[str, list] = {}
    for g in _search(v, keys):
        m = re.search(pattern, _filename(g))
        if m and f"{m[1]}-{m[2]}" in keys:
            by_month.setdefault(f"{m[1]}-{m[2]}", []).append(g)
    return by_month


# ---------- Routes ----------

def _opendap_get(session, g, ce: str, retries: int = 3) -> Path:
    """Request one subset (`ce` = DAP4 constraint) and write it to a temp file the caller deletes."""
    url = next(u["URL"] for u in g["umm"]["RelatedUrls"] if u.get("Subtype") == "OPENDAP DATA")
    for attempt in range(retries):
        try:
            r = session.get(f"{url}.dap.nc4?dap4.ce={ce}", timeout=180)
            r.raise_for_status()
            break
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(10 * (attempt + 1))
    fd, path = tempfile.mkstemp(suffix=".nc4")
    with open(fd, "wb") as f:
        f.write(r.content)
    return Path(path)


def _read_subset(path: Path, var: str) -> np.ndarray:
    """First 2-D slice of `var` from an OPeNDAP subset (searched through groups, e.g. HDF-EOS paths)."""
    import h5py

    with h5py.File(path) as h:
        found = []
        h.visit(lambda n: found.append(n) if n.split("/")[-1] == var and isinstance(h[n], h5py.Dataset) else None)
        a = h[found[0]][()].astype(float)
    return a.reshape(a.shape[-2:]) if a.ndim > 2 else a


def _merra(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path) as ds:
        return merra_to_half(ds[var].values[0].astype(float), ds["lat"].values, ds["lon"].values)


def _gldas(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path) as ds:
        return gldas_to_half(ds[var].values[0].astype(float))


def _opendap_month(session, gs: list, ce: str, reader, var: str) -> np.ndarray:
    fields = []
    for g in gs:
        p = _opendap_get(session, g, ce)
        try:
            fields.append(reader(p, var))
        finally:
            p.unlink(missing_ok=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(fields, axis=0)


def fetch_opendap(name: str, v: dict, keys: list[str], ce: str, reader, pattern: str | None = None, workers: int = 6) -> None:
    """Monthly product (one granule per month) or, with `pattern`, daily granules averaged into each month."""
    groups = _grouped(v, keys, pattern) if pattern else {k: [g] for k, g in _granules(v, keys).items()}
    todo = {k: gs for k, gs in groups.items() if k not in _done(name)}
    session = earthaccess.get_requests_https_session()
    failed: list[str] = []
    with ThreadPoolExecutor(workers) as pool:
        jobs = {pool.submit(_opendap_month, session, gs, ce, reader, v["var"]): k for k, gs in todo.items()}
        for i, job in enumerate(as_completed(jobs), 1):
            try:
                _save(name, jobs[job], job.result())
            except Exception as e:
                failed.append(jobs[job])
                print(f"  {name} {jobs[job]}: {type(e).__name__} {e}"[:200], flush=True)
            if i % 24 == 0:
                print(f"  {name}: {i}/{len(jobs)} months", flush=True)
    if failed:
        print(f"  {name}: {len(failed)} months failed after retries: {sorted(failed)}. Rerun to resume.", flush=True)


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


def _read_cmg(path: Path, var: str, scale: float, valid: tuple[float, float]) -> np.ndarray:
    from pyhdf.SD import SD, SDC

    sd = SD(str(path), SDC.READ)
    try:
        return cmg_to_half(sd.select(var).get().astype(float), scale, valid)
    finally:
        sd.end()


def _read_l3m(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path) as ds:  # fill already masked; chlorophyll and SST share the 9 km grid
        return l3m9km_to_half(ds[var].values.astype(float))


def _read_sealevel(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path) as ds:
        return grace_to_half(ds[var].values.astype(float))


def _read_seaice(path: Path, var: str) -> np.ndarray:
    with xr.open_dataset(path) as ds:
        conc = next(ds[k] for k in ds.data_vars if k.endswith("_ICECON"))  # named by sensor (F13, F17, …)
        return polar_to_half(conc.values[0].astype(float), ds["x"].values, ds["y"].values, south="_S25km_" in path.name)


def _filename(g) -> str:
    return Path(g.data_links()[0]).name


def fetch_files(name: str, v: dict, keys: list[str], reader, pattern: str | None = None, batch: int = 4, retries: int = 3) -> None:
    """Download a few months of files at a time, reduce each to 0.5°, delete the originals.

    With `pattern`, a month may have several files (weekly, per hemisphere); their 0.5° fields are averaged.
    Files are matched to months by name, so a failed download can never shift data onto the wrong month;
    a batch with missing files is retried, and months still missing are reported (rerun to resume).
    """
    groups = _grouped(v, keys, pattern) if pattern else {k: [g] for k, g in _granules(v, keys).items()}
    todo = sorted((k, gs) for k, gs in groups.items() if k not in _done(name))
    failed: list[str] = []
    for i in range(0, len(todo), batch):
        pending = list(todo[i : i + batch])
        for attempt in range(retries):
            tmp = Path(tempfile.mkdtemp(prefix=f"td-{name}-"))
            try:
                try:
                    paths = earthaccess.download([g for _, gs in pending for g in gs], local_path=str(tmp), show_progress=False)
                except Exception as e:  # network blips: retry the batch
                    print(f"  {name}: download error ({type(e).__name__}), retry {attempt + 1}/{retries}", flush=True)
                    paths = []
                by_name = {Path(p).name: Path(p) for p in paths}
                for k, gs in list(pending):
                    files = [by_name.get(_filename(g)) for g in gs]
                    if all(p is not None and p.exists() for p in files):
                        try:
                            with warnings.catch_warnings():
                                warnings.simplefilter("ignore", RuntimeWarning)
                                field = np.nanmean([reader(p, v["var"]) for p in files], axis=0)
                        except Exception as e:  # truncated download: leave pending so the batch retries
                            print(f"  {name} {k}: unreadable file ({type(e).__name__}), retrying", flush=True)
                            continue
                        _save(name, k, field)
                        pending.remove((k, gs))
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
            if not pending:
                break
            time.sleep(10 * (attempt + 1))
        failed += [k for k, _ in pending]
        print(f"  {name}: {min(i + batch, len(todo))}/{len(todo)} months", flush=True)
    if failed:
        print(f"  {name}: {len(failed)} months failed after retries: {failed}. Rerun to resume.", flush=True)


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


def fetch_gistemp(name: str, v: dict, keys: list[str]) -> None:
    """NASA GISTEMP v4 gridded anomalies: one public file (not Earthdata) holding every month since 1880."""
    import gzip
    import urllib.request

    tmp = Path(tempfile.mkdtemp())
    try:
        path = tmp / "gistemp.nc"
        with urllib.request.urlopen(v["url"], timeout=300) as r:
            path.write_bytes(gzip.decompress(r.read()))
        with xr.open_dataset(path) as ds:
            months = np.array([str(t)[:7] for t in ds["time"].values])
            lat, lon = ds["lat"].values, ds["lon"].values
            data = ds[v["var"]].values.astype(float)
        for k in keys:
            sel = np.flatnonzero(months == k)
            if sel.size:
                _save(name, k, gistemp_to_half(data[sel[0]], lat, lon))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def fetch_cci(name: str, v: dict, keys: list[str], workers: int = 8) -> None:
    """ESA CCI soil moisture: open daily files from the CEDA archive (no login), averaged into each month."""
    import calendar
    import urllib.request

    def day(url: str) -> np.ndarray | None:
        for attempt in range(6):  # CEDA drops connections now and then (IncompleteRead, read timeouts)
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    raw = r.read()
                break
            except Exception as e:
                if getattr(e, "code", None) == 404:
                    return None
                if attempt == 5:
                    raise
                time.sleep(15 * (attempt + 1))
        fd, path = tempfile.mkstemp(suffix=".nc")
        with open(fd, "wb") as f:
            f.write(raw)
        try:
            with xr.open_dataset(path) as ds:
                return cci_to_half(ds[v["var"]].values[0].astype(float))
        finally:
            Path(path).unlink(missing_ok=True)

    todo = [k for k in keys if k not in _done(name)]
    with ThreadPoolExecutor(workers) as pool:
        for k in todo:
            y, m = map(int, k.split("-"))
            urls = [v["url"].format(y=y, date=f"{y:04d}{m:02d}{d:02d}") for d in range(1, calendar.monthrange(y, m)[1] + 1)]
            fields = [f for f in pool.map(day, urls) if f is not None]
            if not fields:  # month not published (yet)
                continue
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                _save(name, k, np.nanmean(np.stack(fields), axis=0))
            print(f"  {name} {k}: {len(fields)} days", flush=True)


_OMI_DAY = r"_(\d{4})m(\d{2})\d{2}_"  # OMI-Aura_L3-OMNO2d_2015m0701_…
_AIRS_LEVEL = 17  # 10 hPa in StdPressureLev (1000 → 1 hPa): middle stratosphere, where CO2 cooling is clear (50 hPa stalled after 2000)


def _omi(path: Path, var: str) -> np.ndarray:
    return omi_to_half(_read_subset(path, var))


# name → fetcher(name, v, keys). One entry per variable, so `scripts/fetch.py all` covers every tier.
ROUTE_OF = {
    "t2m": fetch_gistemp,
    "aod": lambda n, v, k: fetch_opendap(n, v, k, f"/{v['var']};/lat;/lon", _merra),
    "precip": lambda n, v, k: fetch_files(n, v, k, _read_imerg),
    "ndvi": lambda n, v, k: fetch_files(n, v, k, _read_ndvi),
    "tws": fetch_grace,
    "lst": lambda n, v, k: fetch_files(n, v, k, lambda p, var: _read_cmg(p, var, 0.02, (7500, 65535))),
    "snow": lambda n, v, k: fetch_files(n, v, k, lambda p, var: _read_cmg(p, var, 1.0, (0, 100))),
    "soil": lambda n, v, k: fetch_cci(n, v, [m for m in k if m <= f"{v['end_year']}-12"]),
    "seaice": lambda n, v, k: fetch_files(n, v, k, _read_seaice, pattern=r"_[NS]25km_(\d{4})(\d{2})_v"),
    "sst": lambda n, v, k: fetch_files(n, v, k, _read_l3m),
    "no2": lambda n, v, k: fetch_opendap(n, v, k, "/HDFEOS/GRIDS/ColumnAmountNO2/Data_Fields/" + v["var"], _omi, pattern=_OMI_DAY, workers=4),
    "ozone": lambda n, v, k: fetch_opendap(n, v, [m for m in k if m >= f"{v['start_year']}-01"], f"/{v['var']}", lambda p, var: omps_to_half(_read_subset(p, var)), pattern=_OMI_DAY),
    "airs": lambda n, v, k: fetch_opendap(n, v, k, f"/ascending/Data_Fields/{v['var']}[{_AIRS_LEVEL}:{_AIRS_LEVEL}][0:179][0:359]", lambda p, var: airs_to_half(_read_subset(p, var))),
    "chlor": lambda n, v, k: fetch_files(n, v, k, _read_l3m),
    "sealevel": lambda n, v, k: fetch_files(n, v, k, _read_sealevel, pattern=r"_(\d{4})(\d{2})\d{2}\.nc$", batch=1),
}


def fetch(name: str) -> None:
    cfg = config()
    keys = month_keys(cfg["window"]["start"], cfg["window"]["end"])
    if not earthaccess.login(strategy="netrc").authenticated:
        raise SystemExit("Not logged in to Earthdata: see docs/datasets.md")
    ROUTE_OF[name](name, cfg["variables"][name], keys)


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
