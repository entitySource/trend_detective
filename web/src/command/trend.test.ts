import { describe, expect, it } from 'vitest'
import { normCdf, quickTrend } from './trend'

const years = Array.from({ length: 23 }, (_, i) => 2003 + i)

describe('quickTrend', () => {
  it('recovers the slope of a straight line and calls it significant', () => {
    const t = quickTrend(
      years.map((y) => 0.05 * (y - 2003)),
      years,
    )!
    expect(t.slopePerDecade).toBeCloseTo(0.5, 10)
    expect(t.totalChange).toBeCloseTo(1.1, 10)
    expect(t.p).toBeLessThan(0.001)
  })

  it('finds no trend in a flat zigzag', () => {
    const t = quickTrend(
      years.map((_, i) => (i % 2 ? 1 : -1)),
      years,
    )!
    expect(t.p).toBeGreaterThan(0.5)
  })

  it('skips missing years and refuses very short series', () => {
    expect(quickTrend([1, 2, NaN, 4], [2003, 2004, 2005, 2006])).toBeNull()
    expect(quickTrend([1, 2, NaN, 4, 5, 6], [2003, 2004, 2005, 2006, 2007, 2008])!.n).toBe(5)
  })
})

describe('normCdf', () => {
  it('matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6)
    expect(normCdf(1.959964)).toBeCloseTo(0.975, 5)
    expect(normCdf(-1.959964)).toBeCloseTo(0.025, 5)
  })
})
