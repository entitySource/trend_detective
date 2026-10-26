"""Regridding and orientation helpers in td/fetch.py, on synthetic fields with known answers."""

from __future__ import annotations

import numpy as np
import pytest

from td.fetch import LATS, LONS, coarsen_mean, grace_to_half, imerg_to_half, merra_to_half, month_keys, ndvi_to_half


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
