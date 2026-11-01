"""Regridding and orientation helpers in td/fetch.py, on synthetic fields with known answers."""

from __future__ import annotations

import numpy as np
import pytest

from td.fetch import (
    LATS,
    LONS,
    airs_to_half,
    cmg_to_half,
    coarsen_mean,
    gistemp_to_half,
    gldas_to_half,
    grace_to_half,
    imerg_to_half,
    merra_to_half,
    month_keys,
    ndvi_to_half,
    omi_to_half,
    polar_to_half,
    polar_xy,
)


def test_month_keys_cover_the_window():
    keys = month_keys("2003-01", "2025-12")
    assert len(keys) == 276 and keys[0] == "2003-01" and keys[-1] == "2025-12"


def test_coarsen_mean_ignores_nan_blocks():
    a = np.arange(16, dtype=float).reshape(4, 4)
    a[:2, :2] = np.nan
    out = coarsen_mean(a, 2)
    assert np.isnan(out[0, 0]) and out[1, 1] == np.mean([10, 11, 14, 15])


def test_merra_bilinear_recovers_a_lat_lon_plane_and_wraps():
    lat = np.arange(-90, 90.01, 0.5)
    lon = np.arange(-180, 180, 0.625)
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    out = merra_to_half(la + 0.01 * lo, lat, lon)
    assert out.shape == (360, 720)
    np.testing.assert_allclose(out[:, 1:-1], (LATS[:, None] + 0.01 * LONS[None, 1:-1]), atol=1e-9)
    # Near the date line the value must come from both sides, not be NaN.
    assert np.isfinite(out[:, -1]).all() and np.isfinite(out[:, 0]).all()


def test_gistemp_bilinear_recovers_a_plane_wraps_and_fills_polar_rims():
    lat = np.arange(-89, 90, 2.0)
    lon = np.arange(-179, 180, 2.0)
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    out = gistemp_to_half(la + 0.0 * lo + 1.0, lat, lon)
    assert out.shape == (360, 720) and np.isfinite(out).all()
    inner = (LATS >= -89) & (LATS <= 89)
    np.testing.assert_allclose(out[inner], np.broadcast_to(LATS[inner, None] + 1.0, out[inner].shape), atol=1e-9)
    np.testing.assert_allclose(out[0], 89 + 1.0)  # 89.75°N takes the 89°N row
    field = np.where(la > 0, np.nan, 1.0)
    assert np.isnan(gistemp_to_half(field, lat, lon)[100]).all()  # gaps stay gaps


def test_imerg_is_transposed_flipped_and_converted():
    lat = np.linspace(-89.95, 89.95, 1800)
    field = np.repeat(lat[None, :], 3600, axis=0)  # (lon, lat): value = latitude
    field = np.where(field > 0, 1.0, 0.0)  # 1 mm/hr in the north only
    out = imerg_to_half(field)
    assert out.shape == (360, 720)
    assert out[0].mean() == pytest.approx(24) and out[-1].mean() == 0  # north row first, mm/day


def test_ndvi_scale_fill_and_coarsen():
    raw = np.full((3600, 7200), 5000.0)
    raw[:10, :10] = -3000
    out = ndvi_to_half(raw)
    assert out.shape == (360, 720)
    assert np.isnan(out[0, 0]) and out[1, 1] == pytest.approx(0.5)


def test_grace_flips_lat_and_moves_greenwich_to_the_middle():
    field = np.zeros((360, 720))
    field[-1, 0] = 7  # northernmost row, lon 0.25°E
    out = grace_to_half(field)
    assert out[0, 360] == 7 and LONS[360] == pytest.approx(0.25) and LATS[0] == pytest.approx(89.75)


def test_cmg_flags_become_nan_and_scale_applies():
    raw = np.full((3600, 7200), 15000.0)
    raw[:10, :10] = 0  # LST fill
    out = cmg_to_half(raw, 0.02, (7500, 65535))
    assert np.isnan(out[0, 0]) and out[1, 1] == pytest.approx(300)


def test_gldas_flips_and_leaves_antarctica_empty():
    lat = np.arange(-59.875, 90, 0.25)
    out = gldas_to_half(np.repeat(lat[:, None], 1440, axis=1))
    assert out.shape == (360, 720)
    assert out[0, 0] == pytest.approx(89.75) and np.isnan(out[-1]).all()
    assert out[299, 0] == pytest.approx(-59.75)


def test_omi_is_south_first_with_huge_fill():
    lat = np.linspace(-89.875, 89.875, 720)
    field = np.repeat(lat[:, None], 1440, axis=1)
    field[:, :2] = -1.2676506e30
    out = omi_to_half(field)
    assert out[0, 5] == pytest.approx(89.75) and np.isnan(out[0, 0])


def test_airs_cells_double():
    f = np.arange(180 * 360, dtype=float).reshape(180, 360)
    out = airs_to_half(f)
    assert out.shape == (360, 720) and out[1, 1] == f[0, 0] and out[2, 2] == f[1, 1]


def test_polar_projection_matches_nsidc_grid_corner():
    # NSIDC: the north grid's upper-left corner (-3850 km, 5850 km) is 30.98N, 168.35E.
    x, y = polar_xy(np.array(30.98), np.array(168.35), south=False)
    assert x == pytest.approx(-3850e3, abs=5e3) and y == pytest.approx(5850e3, abs=5e3)
    x, y = polar_xy(np.array(90.0), np.array(0.0), south=False)
    assert abs(x) < 1 and abs(y) < 1


def test_polar_to_half_fills_only_its_hemisphere_and_masks_flags():
    x = np.arange(-3837500, 3750000, 25000.0)
    y = np.arange(5837500, -5350000, -25000.0)
    conc = np.full((len(y), len(x)), 0.5)
    conc[len(y) // 2, len(x) // 2] = 2.54  # land flag near the pole
    out = polar_to_half(conc, x, y, south=False)
    assert np.isnan(out[LATS < 0]).all()
    assert out[0, 100] == pytest.approx(50) or np.isnan(out[0, 100])
    assert np.nanmax(out) == pytest.approx(50)
