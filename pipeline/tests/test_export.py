"""Export helpers in td/export.py on synthetic data: regional coverage rule, per-variable year axis, check statuses."""

from __future__ import annotations

import json

import numpy as np

from td.export import YEARS, _region_check, region_series, years_kept


def _cube(n_years: int = 20, shape=(4, 4), seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    trend = np.arange(n_years, dtype=float)[:, None, None] * 0.1
    return trend + rng.normal(0, 0.05, (n_years, *shape))


def test_region_series_full_coverage_has_a_trend():
    full = _cube()
    lats = np.linspace(10, 13, 4)
    mask = np.ones((4, 4), bool)
    series, stats = region_series(full, np.ones((4, 4)), lats, mask, "t2m", years=np.arange(2003, 2023))
    assert np.isfinite(series).all()
    assert stats["slopePerDecade"] > 0.9


def test_region_series_patchy_edge_cells_give_no_trend():
    # One steady cell; the other 15 have data only in scattered years, so under 25% of the data area is steady.
    full = _cube()
    full[:, 1:, :] = np.nan
    full[:, 0, 1:] = np.nan
    full[::3, 1:, :] = 1.0
    lats = np.linspace(10, 13, 4)
    series, stats = region_series(full, np.ones((4, 4)), lats, np.ones((4, 4), bool), "t2m", years=np.arange(2003, 2023))
    assert np.isnan(series).all()
    assert stats["slopePerDecade"] is None


def test_region_series_few_steady_cells_in_big_box_give_no_trend():
    # 8 steady coastal cells in a 20x20 box that is otherwise empty (like Greenland soil moisture): too few to stand for it.
    full = np.full((20, 20, 20), np.nan)
    full[:, 0, :8] = _cube(shape=(1, 8))[:, 0, :]
    lats = np.linspace(60, 70, 20)
    series, stats = region_series(full, np.ones((20, 20)), lats, np.ones((20, 20), bool), "t2m", years=np.arange(2003, 2023))
    assert stats["slopePerDecade"] is None


def test_years_kept_start_and_end():
    assert years_kept({}).all()
    k = years_kept({"start_year": 2012, "end_year": 2024})
    assert YEARS[k][0] == 2012 and YEARS[k][-1] == 2024


def _regions_file(tmp_path, stats_by_id):
    d = tmp_path / "regions"
    d.mkdir()
    regions = [{"id": rid, "seasons": {"ANN": {"values": [0.0] * 3, "stats": {"slopePerDecade": s, "p": p}}}} for rid, (s, p) in stats_by_id.items()]
    (d / "x.json").write_text(json.dumps({"years": [2003, 2004, 2005], "regions": regions}), encoding="utf-8")
    return d


def test_region_check_pass_partial_fail(tmp_path):
    d = _regions_file(tmp_path, {"a": (-1.0, 0.01), "b": (-1.0, 0.07), "c": (1.0, 0.01)})
    assert _region_check(d, "x", {"a": -1}, "id", "n")["status"] == "pass"
    assert _region_check(d, "x", {"a": -1, "b": -1}, "id", "n")["status"] == "partial"
    assert _region_check(d, "x", {"a": -1, "c": -1}, "id", "n")["status"] == "fail"
