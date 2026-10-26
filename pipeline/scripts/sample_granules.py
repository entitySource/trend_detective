"""Download ONE file per Tier 1 dataset and report what is inside (Phase 0 "Still to check").

Needs an Earthdata login saved by earthaccess (_netrc). Files land in data/raw/sample/ (gitignored).

    python scripts/sample_granules.py            # all Tier 1 variables
    python scripts/sample_granules.py aod ndvi   # just these
"""

from __future__ import annotations

import sys
from pathlib import Path

import earthaccess
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "raw" / "sample"
CONFIG = Path(__file__).resolve().parents[1] / "config" / "variables.yaml"
SAMPLE_MONTH = ("2015-07-01", "2015-07-31")


def inspect_hdf4(path: Path, var: str) -> dict:
    from pyhdf.SD import SD, SDC

    sd = SD(str(path), SDC.READ)
    names = list(sd.datasets())
    ds = sd.select(var)
    attrs = ds.attributes()
    data = ds.get().astype(float)
    fill = attrs.get("_FillValue")
    valid = data[data != fill] if fill is not None else data.ravel()
    scale = attrs.get("scale_factor", 1.0)
    return {
        "shape": data.shape,
        "units": attrs.get("units"),
        "fill": fill,
        "scale": scale,
        "offset": attrs.get("add_offset", 0.0),
        "raw_range": (float(valid.min()), float(valid.max())) if valid.size else None,
        "n_vars": len(names),
    }


def inspect_netcdf(path: Path, var: str) -> dict:
    import xarray as xr

    try:
        ds = xr.open_dataset(path, engine="netcdf4", decode_times=False)
    except Exception:
        ds = xr.open_dataset(path, engine="h5netcdf", phony_dims="sort", decode_times=False)
    if var not in ds:  # IMERG keeps its fields in a group
        ds = xr.open_dataset(path, engine="h5netcdf", group="Grid", decode_times=False)
    da = ds[var]
    vals = da.values.astype(float)
    return {
        "shape": vals.shape,
        "dims": da.dims,
        "units": da.attrs.get("units"),
        "fill": da.encoding.get("_FillValue"),
        "scale": da.encoding.get("scale_factor", 1.0),
        "range": (float(np.nanmin(vals)), float(np.nanmax(vals))),
        "n_vars": len(ds.data_vars),
    }


def main(only: list[str]) -> int:
    cfg = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    auth = earthaccess.login(strategy="netrc")
    if not auth.authenticated:
        print("Not logged in: run earthaccess.login(strategy='interactive', persist=True) first.")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    failed = 0
    for key, v in cfg["variables"].items():
        if v.get("tier") != 1 or (only and key not in only):
            continue
        print(f"\n=== {key}: {v['product']} v{v['version']}")
        try:
            temporal = None if v.get("expected_granules") == 1 else SAMPLE_MONTH
            results = earthaccess.search_data(short_name=v["product"], version=v["version"], temporal=temporal, count=1)
            if not results:
                raise RuntimeError("no granule found")
            files = earthaccess.download(results[:1], local_path=str(OUT / key))
            path = Path(files[0])
            size = path.stat().st_size / 1e6
            info = inspect_hdf4(path, v["var"]) if path.suffix.lower() in (".hdf", ".hdf4") else inspect_netcdf(path, v["var"])
            print(f"file  {path.name}  ({size:.1f} MB)  -> x{v.get('expected_granules', 276)} granules ~ {size * v.get('expected_granules', 276) / 1000:.1f} GB")
            for k, val in info.items():
                print(f"  {k:9} {val}")
        except Exception as e:  # report each dataset, keep going
            failed += 1
            print(f"FAILED: {type(e).__name__}: {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
