"""Output data contract between the pipeline and the web app. Human-readable spec: docs/data-contract.md.

Everything the front-end reads goes through these writers, and every JSON file is checked against SCHEMAS,
so the mock generator and the real pipeline cannot drift apart.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import jsonschema
import numpy as np

CONTRACT_VERSION = 1
PLANES = ("slope", "p", "q", "snr")
MERC_LAT = 85.0511287798
OVERLAY_BOUNDS = [[-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT]]
PIXEL_MISSING = -32768


# ---------- Grid ----------

def grid_spec(deg: float = 0.5) -> dict:
    """Cell-centre grid, north to south, west to east."""
    return {
        "lat0": 90 - deg / 2,
        "dlat": -deg,
        "nlat": round(180 / deg),
        "lon0": -180 + deg / 2,
        "dlon": deg,
        "nlon": round(360 / deg),
    }


def lat_lon(grid: dict) -> tuple[np.ndarray, np.ndarray]:
    lats = grid["lat0"] + grid["dlat"] * np.arange(grid["nlat"])
    lons = grid["lon0"] + grid["dlon"] * np.arange(grid["nlon"])
    return lats, lons


def write_grid(path: Path, planes: dict[str, np.ndarray]) -> None:
    """Little-endian Float32 planes in PLANES order, each nlat×nlon row-major. NaN = no data."""
    shapes = {planes[k].shape for k in PLANES}
    if len(shapes) != 1:
        raise ValueError(f"planes differ in shape: {shapes}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(np.stack([planes[k] for k in PLANES]).astype("<f4").tobytes())


def read_grid(path: Path, grid: dict) -> dict[str, np.ndarray]:
    data = np.frombuffer(path.read_bytes(), dtype="<f4").reshape(len(PLANES), grid["nlat"], grid["nlon"])
    return dict(zip(PLANES, data))


# ---------- Web Mercator overlays ----------

def mercator_rows(height: int, grid: dict) -> np.ndarray:
    """Source grid row for each output row of a Web Mercator image spanning ±MERC_LAT."""
    t = 1 - 2 * (np.arange(height) + 0.5) / height
    lat = np.degrees(np.arctan(np.sinh(np.pi * t)))
    step = abs(grid["dlat"])
    rows = np.floor((90 - lat) / step).astype(int)
    return np.clip(rows, 0, grid["nlat"] - 1)


def to_mercator(rgba: np.ndarray, grid: dict, height: int | None = None) -> np.ndarray:
    """Reproject an equirectangular (nlat, nlon, 4) image to Web Mercator by row lookup."""
    height = height or grid["nlon"]
    return rgba[mercator_rows(height, grid)]


# ---------- Pixel time-series tiles ----------

def write_pixel_tile(path: Path, series: np.ndarray, scale: float, offset: float = 0.0) -> None:
    """(cells, months) anomalies → little-endian Int16, cells row-major north→south within the tile."""
    q = np.round((series - offset) / scale)
    q = np.where(np.isfinite(q), np.clip(q, -32767, 32767), PIXEL_MISSING).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(q.tobytes())


def read_pixel_tile(path: Path, cells: int, scale: float, offset: float = 0.0) -> np.ndarray:
    raw = np.frombuffer(path.read_bytes(), dtype="<i2").reshape(cells, -1)
    return np.where(raw == PIXEL_MISSING, np.nan, raw * scale + offset)


def tile_name(lat_top: float, lon_left: float) -> str:
    """e.g. tile with north-west corner 30°N, 70°E → 'n30e070'."""
    ns = "n" if lat_top >= 0 else "s"
    ew = "e" if lon_left >= 0 else "w"
    return f"{ns}{abs(int(lat_top)):02d}{ew}{abs(int(lon_left)):03d}"


# ---------- JSON files ----------

_num = {"type": ["number", "null"]}
_stats = {
    "type": "object",
    "required": ["slopePerDecade", "ciLow", "ciHigh", "p", "snr", "totalChange", "n"],
    "properties": {
        "slopePerDecade": _num,
        "ciLow": _num,
        "ciHigh": _num,
        "p": _num,
        "pOriginal": _num,
        "snr": _num,
        "totalChange": _num,
        "relChange": _num,
        "n": {"type": "integer"},
    },
}
_season = {"enum": ["ANN", "DJF", "MAM", "JJA", "SON"]}

SCHEMAS: dict[str, dict] = {
    "manifest": {
        "type": "object",
        "required": ["contractVersion", "generated", "mock", "window", "grid", "planes", "seasons", "fdrAlpha", "overlayBounds", "variables", "files"],
        "properties": {
            "contractVersion": {"const": CONTRACT_VERSION},
            "generated": {"type": "string"},
            "mock": {"type": "boolean"},
            "window": {
                "type": "object",
                "required": ["start", "end", "years"],
                "properties": {"start": {"type": "string"}, "end": {"type": "string"}, "years": {"type": "integer"}},
            },
            "grid": {"type": "object", "required": ["lat0", "dlat", "nlat", "lon0", "dlon", "nlon"]},
            "planes": {"const": list(PLANES)},
            "seasons": {"type": "array", "items": _season, "minItems": 1},
            "fdrAlpha": {"type": "number"},
            "overlayBounds": {"type": "array", "minItems": 4, "maxItems": 4},
            "variables": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["id", "label", "trendUnits", "palette", "colorRange", "layers", "regions"],
                    "properties": {
                        "id": {"type": "string"},
                        "label": {"type": "string"},
                        "trendUnits": {"type": "string"},
                        "palette": {"type": "array", "items": {"type": "string"}, "minItems": 3},
                        "colorRange": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
                        "layers": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "required": ["slope", "class", "grid"],
                                "properties": {"slope": {"type": "string"}, "class": {"type": "string"}, "grid": {"type": "string"}},
                            },
                        },
                        "regions": {"type": "string"},
                        "pixels": {
                            "type": ["object", "null"],
                            "required": ["tileDeg", "resDeg", "scale", "offset", "path"],
                        },
                        "note": {"type": "string"},
                        "caution": {"type": "string"},  # data-quality warning shown with the map
                    },
                },
            },
            "files": {
                "type": "object",
                "required": ["contrasts", "ranking", "validation", "regions"],
            },
            # Tier 2/3 variables shown as "catalogued, trend pending" (docs/variables.md).
            "catalogue": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "label", "tier", "sphere", "product"],
                    "properties": {"tier": {"enum": [2, 3]}, "note": {"type": "string"}, "caution": {"type": "string"}},
                },
            },
        },
    },
    "regions-index": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["id", "name", "bbox"],
            "properties": {
                "id": {"type": "string"},
                "name": {"type": "string"},
                "bbox": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
            },
        },
    },
    "regions": {
        "type": "object",
        "required": ["variable", "years", "regions"],
        "properties": {
            "variable": {"type": "string"},
            "years": {"type": "array", "items": {"type": "integer"}},
            "regions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "seasons"],
                    "properties": {
                        "id": {"type": "string"},
                        "seasons": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "required": ["values", "stats"],
                                "properties": {"values": {"type": "array", "items": _num}, "stats": _stats},
                            },
                        },
                    },
                },
            },
        },
    },
    "contrasts": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["variable", "season", "rising", "falling"],
            "properties": {
                "variable": {"type": "string"},
                "season": _season,
                "rising": {"type": "object", "required": ["region", "slopePerDecade", "snr", "p"]},
                "falling": {"type": "object", "required": ["region", "slopePerDecade", "snr", "p"]},
                "featured": {"type": "boolean"},
            },
        },
    },
    "ranking": {
        "type": "object",
        "additionalProperties": {
            "type": "object",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["variable", "pctRising", "pctFalling", "mixed"],
                    "properties": {
                        "variable": {"type": "string"},
                        "pctRising": {"type": "number"},
                        "pctFalling": {"type": "number"},
                        "mixed": {"type": "boolean"},
                        "regionalSnr": _num,
                    },
                },
            },
        },
    },
    "validation": {
        "type": "object",
        "required": ["checks"],
        "properties": {
            "checks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "name", "status"],
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "status": {"enum": ["pass", "fail", "pending"]},
                        "ours": _num,
                        "published": _num,
                        "tolerance": _num,
                        "units": {"type": "string"},
                        "note": {"type": "string"},
                    },
                },
            }
        },
    },
}


def validate(kind: str, obj: object) -> None:
    jsonschema.validate(obj, SCHEMAS[kind])


def _clean(x: object) -> object:
    """JSON has no NaN: turn NaN/inf into null and numpy scalars into Python numbers."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return float(x) if math.isfinite(x) else None
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    return x


def write_json(path: Path, obj: object, kind: str | None = None) -> None:
    obj = _clean(obj)
    if kind:
        validate(kind, obj)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
