"""Trend statistics (PLAN-02 §3). Phase 0 holds only what the mock generator needs; the per-cell
Hamed–Rao engine, aggregation and field significance land here in Phase 1."""

from __future__ import annotations

import numpy as np
import pymannkendall as mk
from scipy import stats as sps


def bh_fdr(p: np.ndarray) -> np.ndarray:
    """Benjamini–Hochberg q-values for every finite p; NaN stays NaN. Matches statsmodels fdr_bh."""
    p = np.asarray(p, dtype=float)
    q = np.full(p.shape, np.nan)
    flat = p.ravel()
    ok = np.isfinite(flat)
    vals = flat[ok]
    m = vals.size
    if m == 0:
        return q
    order = np.argsort(vals)
    ranked = vals[order] * m / np.arange(1, m + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(m)
    out[order] = np.minimum(ranked, 1.0)
    qflat = q.ravel()
    qflat[ok] = out
    return qflat.reshape(p.shape)


def series_stats(values: np.ndarray, years: np.ndarray, climatology: float | None = None) -> dict:
    """Trend summary for one annual series: modified-MK p, Sen's slope with 95% CI, SNR."""
    ok = np.isfinite(values)
    n = int(ok.sum())
    if n < 0.9 * len(values) or n < 8:
        return {"slopePerDecade": None, "ciLow": None, "ciHigh": None, "p": None, "pOriginal": None, "snr": None, "totalChange": None, "relChange": None, "n": n}
    x, y = years[ok].astype(float), values[ok]
    slope, _, lo, hi = sps.theilslopes(y, x, alpha=0.95)
    resid = y - (np.median(y) + slope * (x - np.median(x)))
    sd = np.std(resid, ddof=1)
    span = years[-1] - years[0]
    return {
        "slopePerDecade": slope * 10,
        "ciLow": lo * 10,
        "ciHigh": hi * 10,
        "p": mk.hamed_rao_modification_test(y).p,
        "pOriginal": mk.original_test(y).p,
        "snr": (slope * 10) / sd if sd > 0 else None,
        "totalChange": slope * span,
        "relChange": slope * span / abs(climatology) if climatology else None,
        "n": n,
    }
