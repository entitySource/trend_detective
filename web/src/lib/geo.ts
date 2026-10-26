// Outline geometry helpers for the base map.
import type { MultiLineString, Position } from 'geojson'

// Lines that cross the ±180° meridian jump from +180 to −180 and get drawn across the whole map
// (Chukotka, Fiji, Kiribati). Break each line wherever consecutive points are more than 180° apart.
export function splitAtAntimeridian(geom: MultiLineString): MultiLineString {
  const out: Position[][] = []
  for (const line of geom.coordinates) {
    let current: Position[] = []
    for (const pt of line) {
      const prev = current[current.length - 1]
      if (prev && Math.abs(pt[0] - prev[0]) > 180) {
        if (current.length > 1) out.push(current)
        current = []
      }
      current.push(pt)
    }
    if (current.length > 1) out.push(current)
  }
  return { type: 'MultiLineString', coordinates: out }
}
