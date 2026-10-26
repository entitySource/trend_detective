"""Analysis regions. Phase 0 uses hand-drawn boxes so the mock works without extra dependencies;
Phase 1 adds the IPCC AR6 reference regions through regionmask (PLAN-02 §3 step F)."""

from __future__ import annotations

import numpy as np

# id, name, (west, south, east, north)
BOXES: list[tuple[str, str, tuple[float, float, float, float]]] = [
    ("glb", "Whole world", (-180, -90, 180, 90)),
    ("arc", "Arctic", (-180, 66, 180, 90)),
    ("eas", "Eastern China", (110, 28, 122, 40)),
    ("igp", "Indo-Gangetic Plain", (75, 22, 88, 30)),
    ("eur", "Europe", (-10, 40, 30, 60)),
    ("amz", "Amazon", (-70, -10, -50, 2)),
    ("sah", "Sahel", (-15, 10, 35, 18)),
    ("aus", "Australia", (115, -38, 153, -12)),
]


def index() -> list[dict]:
    return [{"id": i, "name": n, "bbox": list(b)} for i, n, b in BOXES]


def box_mask(lats: np.ndarray, lons: np.ndarray, bbox: tuple[float, float, float, float]) -> np.ndarray:
    w, s, e, n = bbox
    la = (lats >= s) & (lats <= n)
    lo = (lons >= w) & (lons <= e)
    return la[:, None] & lo[None, :]


def area_mean(field: np.ndarray, lats: np.ndarray, mask: np.ndarray) -> float:
    """cos(lat)-weighted mean over the masked, finite cells of a (nlat, nlon) field."""
    w = np.cos(np.radians(lats))[:, None] * np.ones(field.shape[1])[None, :]
    ok = mask & np.isfinite(field)
    return float((field[ok] * w[ok]).sum() / w[ok].sum()) if ok.any() else float("nan")
