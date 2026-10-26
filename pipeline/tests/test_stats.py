"""Stats engine tests from PLAN-02 §6: hand-computed values, library oracles, synthetic and Monte Carlo checks."""

from __future__ import annotations

import numpy as np
import pymannkendall as mk
import pytest
from scipy import ndimage
from scipy import stats as sps

from td.regions import area_mean
from td.stats import aggregate, bh_fdr, field_significant, mk_test, monthly_anomalies, series_stats, trend_field

YEARS = np.arange(2003, 2026)


# ---------- Hand-computed Mann-Kendall ----------

def test_mk_on_1_to_5_matches_hand_calculation():
    r = mk.original_test(np.arange(1, 6, dtype=float))
    assert r.s == 10
    assert r.var_s == pytest.approx(16.667, abs=1e-3)
    assert r.z == pytest.approx(2.205, abs=1e-3)
    assert r.p == pytest.approx(0.0275, abs=1e-4)


def test_mk_with_ties_uses_the_tie_corrected_variance():
    # n=6, one pair of ties: Var(S) = [n(n-1)(2n+5) - t(t-1)(2t+5)] / 18 = (510 - 18) / 18
    assert mk.original_test(np.array([1, 2, 2, 3, 4, 5], dtype=float)).var_s == pytest.approx(492 / 18)


def test_constant_series_does_not_crash_and_is_not_significant():
    s = series_stats(np.full(YEARS.size, 3.0), YEARS)
    assert s["slopePerDecade"] == 0 and s["p"] == pytest.approx(1.0)


# ---------- Oracle agreement on random series ----------

def test_engine_matches_libraries_on_random_series():
    rng = np.random.default_rng(42)
    for _ in range(300):
        n = int(rng.integers(10, 51))
        y = np.round(rng.normal(size=n) + rng.normal() * 0.05 * np.arange(n), 1)  # rounding makes ties
        t = mk_test(y)
        assert t["pOriginal"] == pytest.approx(mk.original_test(y).p, abs=1e-12)
        assert 0 <= t["p"] <= 1
        assert t["p"] >= t["pOriginal"] - 1e-9  # the correction only ever widens the variance
        years = np.arange(n)
        assert series_stats(y, years)["slopePerDecade"] / 10 == pytest.approx(sps.theilslopes(y, years)[0], abs=1e-12)
        assert np.sign(mk.original_test(y).Tau) == np.sign(sps.kendalltau(years, y)[0]) or abs(t["tau"]) < 1e-12


def test_hamed_rao_nan_falls_back_to_original_p():
    # Strong negative lag-1 autocorrelation can drive the Hamed–Rao variance negative.
    y = np.tile([1.0, -1.0], 12) + np.linspace(0, 0.5, 24)
    t = mk_test(y, method="hamed_rao")
    assert np.isfinite(t["p"])


# ---------- Anomalies and aggregation ----------

def test_anomalies_remove_the_seasonal_cycle_and_keep_the_trend():
    t = np.arange(YEARS.size * 12)
    months = t % 12 + 1
    rng = np.random.default_rng(0)
    series = 10 * np.sin(2 * np.pi * t / 12) + 0.002 * t + rng.normal(0, 0.1, t.size)
    anoms = monthly_anomalies(series, months)
    spectrum = np.abs(np.fft.rfft(anoms - anoms.mean()))
    annual_bin = t.size // 12
    assert spectrum[annual_bin] < 0.05 * np.abs(np.fft.rfft(series - series.mean()))[annual_bin]
    years_of = YEARS[t // 12]
    yrs, ann = aggregate(anoms, years_of, months, "ANN")
    assert series_stats(ann, yrs)["slopePerDecade"] / 10 == pytest.approx(0.002 * 12, rel=0.02)


def _calendar(n_years=4, start=2003):
    t = np.arange(n_years * 12)
    return start + t // 12, t % 12 + 1


def test_djf_is_labelled_by_january_and_first_djf_is_dropped():
    years, months = _calendar()
    data = years * 100.0 + months  # unique per month
    yrs, djf = aggregate(data, years, months, "DJF")
    assert list(yrs) == [2004, 2005, 2006]
    assert djf[0] == pytest.approx(np.mean([2003 * 100 + 12, 2004 * 100 + 1, 2004 * 100 + 2]))


def test_valid_month_thresholds_and_nan_propagation():
    years, months = _calendar(2)
    data = np.ones(24)
    data[:5] = np.nan  # 2003 has 7 valid months -> ANN NaN
    data[12 + 5] = np.nan  # 2004 JJA has 2 of 3 -> valid
    yrs, ann = aggregate(data, years, months, "ANN")
    assert np.isnan(ann[0]) and ann[1] == 1
    data[12 + 6] = np.nan  # now 1 of 3
    _, jja = aggregate(data, years, months, "JJA")
    assert np.isnan(jja[1])


def test_area_weighting():
    lats = np.linspace(-89.75, 89.75, 360)
    mask = np.ones((360, 4), bool)
    assert area_mean(np.full((360, 4), 5.0), lats, mask) == pytest.approx(5.0)
    field = np.repeat(np.abs(lats)[:, None], 4, axis=1)
    # Analytic cos-weighted mean of |lat| over the sphere = 90 - 180/pi ≈ 32.70°
    assert area_mean(field, lats, mask) == pytest.approx(90 - 180 / np.pi, abs=0.05)


# ---------- Monte Carlo (seeded) ----------

def _ar1(n, phi, rng):
    x = np.empty(n)
    x[0] = rng.normal() / np.sqrt(1 - phi**2)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + rng.normal()
    return x


def test_autocorrelation_inflates_plain_mk_and_the_correction_controls_it():
    rng = np.random.default_rng(7)
    sims = [_ar1(23, 0.5, rng) for _ in range(2000)]
    plain = np.mean([mk.original_test(s).p < 0.05 for s in sims])
    ours = np.mean([mk_test(s)["p"] < 0.05 for s in sims])
    hamed_rao = np.mean([mk_test(s, method="hamed_rao")["p"] < 0.05 for s in sims])
    assert plain > 0.15, plain  # documents the inflation
    assert hamed_rao > 0.15, hamed_rao  # why the plan's Hamed–Rao choice was dropped at n = 23
    assert 0.02 <= ours <= 0.10, ours  # measured ~8%: close to nominal 5%, far below plain MK's ~21%


def test_fdr_on_a_noise_field_and_a_field_with_a_trend_block():
    rng = np.random.default_rng(11)
    size, n = 40, YEARS.size
    noise = ndimage.gaussian_filter(rng.normal(size=(n, size, size)), (0, 1.5, 1.5))
    noise /= noise.std()
    planes = trend_field(noise, YEARS, n_jobs=1)
    assert (planes["q"] <= 0.10).mean() < 0.01
    assert (planes["p"] < 0.05).mean() > (planes["q"] <= 0.10).mean()
    assert not field_significant(planes["q"], 0.10) or (planes["q"] <= 0.10).sum() < 3

    trend = np.zeros((n, size, size))
    # 2 sigma per decade (power ~99% per cell before FDR)
    trend[:, 10:22, 10:22] = (0.2 * (YEARS - YEARS.mean()))[:, None, None]
    planes = trend_field(noise + trend, YEARS, n_jobs=1)
    sig = planes["q"] <= 0.10
    block = np.zeros((size, size), bool)
    block[10:22, 10:22] = True
    assert sig[block].mean() > 0.8
    assert sig[~block].mean() < 0.02


def test_bh_fdr_handles_all_nan():
    assert np.isnan(bh_fdr(np.full(5, np.nan))).all()
