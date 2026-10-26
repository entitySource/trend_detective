import { describe, expect, it } from 'vitest'
import type { Grid } from '../contract'
import { cellIndex, readCell } from './grid'

const HALF: Grid = { lat0: 89.75, dlat: -0.5, nlat: 360, lon0: -179.75, dlon: 0.5, nlon: 720 }

describe('cellIndex', () => {
  it('maps corners and the origin to the right cells', () => {
    expect(cellIndex(HALF, 89.9, -179.9)).toEqual({ row: 0, col: 0 })
    expect(cellIndex(HALF, -89.9, 179.9)).toEqual({ row: 359, col: 719 })
    expect(cellIndex(HALF, 0.1, 0.1)).toEqual({ row: 179, col: 360 })
    expect(cellIndex(HALF, -0.1, -0.1)).toEqual({ row: 180, col: 359 })
  })

  it('wraps longitudes from a panned map', () => {
    expect(cellIndex(HALF, 0.1, 360.1)).toEqual(cellIndex(HALF, 0.1, 0.1))
  })
})

describe('readCell', () => {
  it('reads each plane at the same cell and turns NaN into null', () => {
    const g: Grid = { lat0: 0.5, dlat: -1, nlat: 2, lon0: 0.5, dlon: 1, nlon: 3 }
    const size = 6
    const data = new Float32Array(4 * size).map((_, i) => i)
    data[2 * size + 1 * 3 + 2] = NaN
    expect(readCell(data, g, 1, 2)).toEqual({ slope: 5, p: 11, q: null, snr: 23 })
  })
})
