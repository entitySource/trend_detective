import { describe, expect, it } from 'vitest'
import { splitAtAntimeridian } from './geo'

describe('splitAtAntimeridian', () => {
  it('breaks a line where it jumps across ±180°', () => {
    const out = splitAtAntimeridian({
      type: 'MultiLineString',
      coordinates: [
        [
          [178, 66],
          [180, 66.5],
          [-180, 66.5],
          [-178, 67],
        ],
      ],
    })
    expect(out.coordinates).toEqual([
      [
        [178, 66],
        [180, 66.5],
      ],
      [
        [-180, 66.5],
        [-178, 67],
      ],
    ])
  })

  it('leaves ordinary lines alone and drops single-point fragments', () => {
    const line = [
      [0, 0],
      [10, 5],
      [20, 0],
    ]
    expect(splitAtAntimeridian({ type: 'MultiLineString', coordinates: [line] }).coordinates).toEqual([line])
    const lonely = splitAtAntimeridian({
      type: 'MultiLineString',
      coordinates: [
        [
          [179, 0],
          [-179, 0],
        ],
      ],
    })
    expect(lonely.coordinates).toEqual([])
  })
})
