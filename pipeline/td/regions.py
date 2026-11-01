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
    ("cvy", "California Central Valley", (-122.5, 35, -118.5, 40.5)),
    ("mde", "Middle East", (35, 20, 60, 37)),
    ("sea", "Southeast Asia (Strait of Malacca)", (95, -6, 120, 6)),
    ("grl", "Greenland", (-55, 60, -20, 83)),
    ("del", "Delhi region", (76.5, 28, 77.8, 29)),
    ("sib", "Siberia", (90, 55, 140, 70)),
    ("tib", "Tibetan Plateau", (78, 28, 100, 38)),
    ("arl", "Aral Sea", (58, 43, 62, 47)),
    ("cng", "Congo rainforest", (12, -5, 30, 5)),
    ("hoa", "Horn of Africa", (38, -2, 51, 12)),
    ("cbt", "US Corn Belt", (-98, 38, -82, 46)),
    ("eus", "Eastern United States", (-90, 35, -70, 45)),
    ("gbr", "Great Barrier Reef", (145, -24, 154, -10)),
    ("bgd", "Ganges–Brahmaputra Delta", (88, 21, 92.5, 25)),
    ("ant", "Antarctic Peninsula", (-70, -70, -55, -60)),
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
