// Reads values out of a pipeline .bin grid: Float32 planes [slope, p, q, snr], each nlat×nlon, north→south.
import { PLANES, type Grid, type Plane } from '../contract'

export function cellIndex(grid: Grid, lat: number, lon: number): { row: number; col: number } | null {
  const row = Math.floor((grid.lat0 - lat) / Math.abs(grid.dlat) + 0.5)
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180
  const col = Math.floor((wrapped - grid.lon0) / grid.dlon + 0.5)
  if (row < 0 || row >= grid.nlat || col < 0 || col >= grid.nlon) return null
  return { row, col }
}

export function readCell(data: Float32Array, grid: Grid, row: number, col: number): Record<Plane, number | null> {
  const size = grid.nlat * grid.nlon
  const out = {} as Record<Plane, number | null>
  PLANES.forEach((plane, k) => {
    const v = data[k * size + row * grid.nlon + col]
    out[plane] = Number.isFinite(v) ? v : null
  })
  return out
}

const cache = new Map<string, Promise<Float32Array>>()

export function loadGrid(url: string, grid: Grid): Promise<Float32Array> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
          return r.arrayBuffer()
        })
        .then((buf) => {
          const expected = PLANES.length * grid.nlat * grid.nlon * 4
          if (buf.byteLength !== expected) throw new Error(`${url}: ${buf.byteLength} bytes, expected ${expected}`)
          return new Float32Array(buf)
        }),
    )
  }
  return cache.get(url)!
}
