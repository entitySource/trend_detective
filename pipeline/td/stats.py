"""Trend statistics (PLAN-02 §3): anomalies → annual/seasonal means → modified Mann-Kendall + Sen's slope
per grid cell → Benjamini–Hochberg FDR across cells → field significance."""

from __future__ import annotations

import warnings

import numpy as np
import pymannkendall as mk
from joblib import Parallel, delayed
from scipy import stats as sps

SEASON_MONTHS = {"ANN": list(range(1, 13)), "DJF": [12, 1, 2], "MAM": [3, 4, 5], "JJA": [6, 7, 8], "SON": [9, 10, 11]}
MIN_MONTHS = {"ANN": 8, "DJF": 2, "MAM": 2, "JJA": 2, "SON": 2}
MIN_VALID_YEARS_FRAC = 0.9


# ---------- Step A: anomalies ----------

def monthly_anomalies(data: np.ndarray, months: np.ndarray) -> np.ndarray:
    """Subtract each calendar month's mean (over the whole record) from a (time, ...) array."""
    out = np.array(data, dtype=float)
    for m in range(1, 13):
        sel = months == m
        if sel.any():
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN cells stay NaN
                out[sel] -= np.nanmean(out[sel], axis=0)
    return out


# ---------- Step B: annual / seasonal aggregation ----------

def aggregate(anoms: np.ndarray, years: np.ndarray, months: np.ndarray, season: str) -> tuple[np.ndarray, np.ndarray]:
    """One value per year from monthly anomalies (time, ...).

    ANN needs ≥ 8 of 12 valid months; seasons need ≥ 2 of 3. DJF is labelled by its January year and
    uses the previous December; the first DJF of the record is dropped because its December is missing.
    """
    want = SEASON_MONTHS[season]
    label = np.where((season == "DJF") & (months == 12), years + 1, years)
    out_years = np.unique(label[np.isin(months, want)])
    if season == "DJF":
        out_years = out_years[(out_years > years.min()) & (out_years <= years.max())]
    vals = np.full((out_years.size,) + anoms.shape[1:], np.nan)
    for i, y in enumerate(out_years):
        sel = (label == y) & np.isin(months, want)
        chunk = anoms[sel]
        count = np.isfinite(chunk).sum(axis=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            mean = np.nanmean(chunk, axis=0)
        vals[i] = np.where(count >= MIN_MONTHS[season], mean, np.nan)
    return out_years, vals


# ---------- Step C/D: one series ----------

# Which autocorrelation correction decides "significant". Monte Carlo on 23-year series (docs/methods.md):
#   lag-1 autocorrelation 0.5, no trend:  plain MK 21% false alarms, Hamed–Rao 22%, trend-free pre-whitening 26%,
#   pre-whitening 4% (but it also removes real trends: 0% power on a 2σ/decade trend), bias-corrected VC 8%.
# "vc" keeps 76% power at 1σ/decade (plain MK: 82%), so it is the default.
MK_METHOD = "vc"


def _vc_test(y: np.ndarray):
    """Variance-corrected MK: lag-1 autocorrelation of the Sen-detrended series, small-sample bias-corrected
    ((n·r1 + 1)/(n − 4), Marriott–Pope), clipped to [0, 0.9], inflating Var(S) by (1 + r1)/(1 − r1)."""
    n = len(y)
    orig = mk.original_test(y)
    t = np.arange(n)
    d = y - sps.theilslopes(y, t)[0] * t if np.ptp(y) else y
    d = d - d.mean()
    denom = float(np.sum(d * d))
    r1 = float(np.sum(d[1:] * d[:-1]) / denom) if denom > 0 else 0.0
    r1 = min(max((n * r1 + 1) / (n - 4), 0.0), 0.9)
    var = orig.var_s * (1 + r1) / (1 - r1)
    z = (orig.s - np.sign(orig.s)) / np.sqrt(var) if orig.s != 0 and var > 0 else 0.0

    class _R:
        p = float(2 * sps.norm.sf(abs(z)))

    return _R


_MK = {
    "vc": _vc_test,
    "prewhite": mk.pre_whitening_modification_test,
    "hamed_rao": mk.hamed_rao_modification_test,
    "original": mk.original_test,
}


def mk_test(y: np.ndarray, method: str = MK_METHOD) -> dict:
    """Mann-Kendall on a gap-free series: the chosen corrected p, plus the original test for comparison.

    If the corrected test returns NaN (Hamed–Rao can, when its variance correction goes negative),
    fall back to the original p.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        orig = mk.original_test(y)
        corrected = _MK[method](y)
    p = corrected.p if np.isfinite(corrected.p) else orig.p
    return {"p": float(p), "pOriginal": float(orig.p), "method": method, "s": float(orig.s), "z": float(orig.z), "tau": float(orig.Tau)}


def series_stats(values: np.ndarray, years: np.ndarray, climatology: float | None = None) -> dict:
    """Trend summary for one annual series: modified-MK p, Sen's slope with 95% CI, SNR."""
    values = np.asarray(values, dtype=float)
    ok = np.isfinite(values)
    n = int(ok.sum())
    if n < MIN_VALID_YEARS_FRAC * len(values) or n < 8:
        return {"slopePerDecade": None, "ciLow": None, "ciHigh": None, "p": None, "pOriginal": None, "snr": None, "totalChange": None, "relChange": None, "n": n}
    x, y = years[ok].astype(float), values[ok]
    if np.ptp(y) == 0:
        slope = lo = hi = 0.0
    else:
        slope, _, lo, hi = sps.theilslopes(y, x, alpha=0.95)
    resid = y - (np.median(y) + slope * (x - np.median(x)))
    sd = np.std(resid, ddof=1)
    span = years[-1] - years[0]
    test = mk_test(y)
    return {
        "slopePerDecade": slope * 10,
        "ciLow": lo * 10,
        "ciHigh": hi * 10,
        "p": test["p"],
        "pOriginal": test["pOriginal"],
        "snr": (slope * 10) / sd if sd > 0 else None,
        "totalChange": slope * span,
        "relChange": slope * span / abs(climatology) if climatology else None,
        "n": n,
    }


# ---------- Step C-E: whole grid ----------

def _cell(values: np.ndarray, years: np.ndarray) -> tuple[float, float, float]:
    s = series_stats(values, years)
    if s["slopePerDecade"] is None:
        return np.nan, np.nan, np.nan
    return s["slopePerDecade"], s["p"], s["snr"] if s["snr"] is not None else np.nan


def trend_field(annual: np.ndarray, years: np.ndarray, n_jobs: int = -1) -> dict[str, np.ndarray]:
    """Per-cell trend planes (slope per decade, p, FDR q, SNR) for an annual (year, lat, lon) array."""
    _, nlat, nlon = annual.shape
    flat = annual.reshape(annual.shape[0], -1)
    out = np.full((3, flat.shape[1]), np.nan)
    todo = np.flatnonzero(np.isfinite(flat).sum(axis=0) >= max(8, MIN_VALID_YEARS_FRAC * len(years)))
    rows = Parallel(n_jobs=n_jobs, batch_size=256)(delayed(_cell)(flat[:, i], years) for i in todo)
    if rows:
        out[:, todo] = np.array(rows).T
    slope, p, snr = (x.reshape(nlat, nlon) for x in out)
    return {"slope": slope, "p": p, "q": bh_fdr(p), "snr": snr}


# ---------- Step E: multiple testing ----------

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


def field_significant(q: np.ndarray, alpha: float, mask: np.ndarray | None = None) -> bool:
    """A map (or region) is field-significant if any of its cells passes FDR."""
    sel = np.isfinite(q) if mask is None else (mask & np.isfinite(q))
    return bool((q[sel] <= alpha).any())
