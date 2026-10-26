"""Colour ramps for the map overlays. Diverging, colour-blind-safe ColorBrewer schemes."""

from __future__ import annotations

import numpy as np

PALETTES: dict[str, list[str]] = {
    # cooler ← → warmer
    "warm": ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"],
    # drier / browner ← → wetter / greener
    "wet": ["#8c510a", "#d8b365", "#f6e8c3", "#f5f5f5", "#c7eae5", "#5ab4ac", "#01665e"],
    # clearer ← → hazier
    "haze": ["#542788", "#998ec3", "#d8daeb", "#f7f7f7", "#fee0b6", "#f1a340", "#b35806"],
}

NOT_SIGNIFICANT = (150, 150, 150, 70)


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def ramp(values: np.ndarray, vmin: float, vmax: float, palette: str) -> np.ndarray:
    """Map values to RGBA by linear interpolation along the palette. NaN → transparent."""
    stops = np.array([_rgb(c) for c in PALETTES[palette]], dtype=float)
    t = np.clip((values - vmin) / (vmax - vmin), 0, 1) * (len(stops) - 1)
    t = np.nan_to_num(t)
    i = np.minimum(t.astype(int), len(stops) - 2)
    f = (t - i)[..., None]
    rgb = stops[i] * (1 - f) + stops[i + 1] * f
    alpha = np.where(np.isfinite(values), 210, 0)[..., None]
    return np.concatenate([rgb, alpha], axis=-1).astype(np.uint8)


def classes(slope: np.ndarray, q: np.ndarray, alpha: float, palette: str) -> np.ndarray:
    """Three-colour map: significant rise, significant fall, not significant (faint grey)."""
    lo, hi = _rgb(PALETTES[palette][0]), _rgb(PALETTES[palette][-1])
    out = np.zeros(slope.shape + (4,), dtype=np.uint8)
    valid = np.isfinite(slope) & np.isfinite(q)
    sig = valid & (q <= alpha)
    out[valid & ~sig] = NOT_SIGNIFICANT
    out[sig & (slope > 0)] = (*hi, 230)
    out[sig & (slope < 0)] = (*lo, 230)
    return out
