"""The data contract: writers round-trip, the projection is right, and mock output passes every schema."""

from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image
from statsmodels.stats.multitest import multipletests

from td import contract as C
from td.mock import generate
from td.stats import bh_fdr, series_stats

GRID_1DEG = C.grid_spec(1.0)


def test_grid_spec_is_cell_centred():
    g = C.grid_spec(0.5)
    assert (g["nlat"], g["nlon"]) == (360, 720)
    lats, lons = C.lat_lon(g)
    assert lats[0] == 89.75 and lats[-1] == -89.75
    assert lons[0] == -179.75 and lons[-1] == 179.75


def test_grid_roundtrip(tmp_path):
    rng = np.random.default_rng(1)
    planes = {k: rng.standard_normal((180, 360)).astype("f4") for k in C.PLANES}
    planes["q"][0, 0] = np.nan
    C.write_grid(tmp_path / "g.bin", planes)
    assert (tmp_path / "g.bin").stat().st_size == 4 * 4 * 180 * 360
    back = C.read_grid(tmp_path / "g.bin", GRID_1DEG)
    for k in C.PLANES:
        np.testing.assert_array_equal(back[k], planes[k])


def test_mercator_rows_put_equator_in_the_middle_and_clip_poles():
    rows = C.mercator_rows(720, C.grid_spec(0.5))
    assert np.all(np.diff(rows) >= 0)
    assert rows[359] in (179, 180) and rows[360] in (179, 180)
    assert rows[0] == 9  # 85.05°N falls in the 85.0-85.5 row
    assert rows[-1] == 350


def test_pixel_tile_roundtrip_with_missing(tmp_path):
    s = np.array([[0.123, -1.5, np.nan], [2.0, 0.0, -0.001]])
    C.write_pixel_tile(tmp_path / "t.bin", s, scale=0.001)
    back = C.read_pixel_tile(tmp_path / "t.bin", cells=2, scale=0.001)
    np.testing.assert_allclose(back, s, atol=5e-4, equal_nan=True)
    assert C.tile_name(30, 70) == "n30e070" and C.tile_name(-10, -80) == "s10w080"


def test_json_writer_turns_nan_into_null_and_validates(tmp_path):
    C.write_json(tmp_path / "v.json", {"checks": [{"id": "x", "name": "x", "status": "pending", "ours": float("nan")}]}, "validation")
    assert json.loads((tmp_path / "v.json").read_text())["checks"][0]["ours"] is None
    with pytest.raises(Exception):
        C.write_json(tmp_path / "bad.json", {"checks": [{"id": "x", "name": "x", "status": "maybe"}]}, "validation")


def test_bh_fdr_matches_statsmodels():
    rng = np.random.default_rng(3)
    p = rng.uniform(size=500) ** 2
    expected = multipletests(p, method="fdr_bh")[1]
    np.testing.assert_allclose(bh_fdr(p), expected, rtol=1e-12)
    grid = np.where(rng.uniform(size=(20, 30)) < 0.1, np.nan, rng.uniform(size=(20, 30)))
    q = bh_fdr(grid)
    assert np.isnan(q[np.isnan(grid)]).all()
    np.testing.assert_allclose(q[np.isfinite(grid)], multipletests(grid[np.isfinite(grid)], method="fdr_bh")[1])


def test_series_stats_finds_a_clear_trend():
    years = np.arange(2003, 2026)
    s = series_stats(0.03 * (years - 2003) + np.random.default_rng(0).normal(0, 0.05, years.size), years)
    assert s["slopePerDecade"] == pytest.approx(0.3, abs=0.05)
    assert s["p"] < 0.01 and s["ciLow"] < s["slopePerDecade"] < s["ciHigh"]
    gappy = np.where(np.arange(years.size) < 5, np.nan, 1.0)
    assert series_stats(gappy, years)["slopePerDecade"] is None


def test_mock_output_follows_the_contract(tmp_path):
    m = generate(tmp_path, seasons=("ANN",), deg=1.0)
    C.validate("manifest", json.loads((tmp_path / "manifest.json").read_text()))
    for kind, rel in [("contrasts", "contrasts.json"), ("ranking", "ranking.json"), ("validation", "validation.json"), ("regions-index", "regions/index.json")]:
        C.validate(kind, json.loads((tmp_path / rel).read_text()))
    for v in m["variables"]:
        C.validate("regions", json.loads((tmp_path / v["regions"]).read_text()))
        layer = v["layers"]["ANN"]
        assert (tmp_path / layer["grid"]).stat().st_size == 4 * 4 * 180 * 360
        img = Image.open(tmp_path / layer["slope"])
        assert img.mode == "RGBA" and img.size == (360, 360)
    assert [v["id"] for v in m["variables"]] == ["t2m", "tws", "precip", "ndvi", "aod"]
    assert {c["tier"] for c in m["catalogue"]} == {2, 3} and len(m["catalogue"]) == 10
    contrasts = json.loads((tmp_path / "contrasts.json").read_text())
    aod = next(c for c in contrasts if c["variable"] == "aod")
    assert {aod["rising"]["region"], aod["falling"]["region"]} == {"igp", "eas"}
