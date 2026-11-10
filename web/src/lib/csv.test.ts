import { describe, expect, it } from 'vitest'
import { seriesCsv, valueUnits } from './csv'

const stats = { slopePerDecade: 0.583, ciLow: 0.354, ciHigh: 0.944, p: 0.0004, snr: 1.3, totalChange: 1.28, n: 23 }

describe('seriesCsv', () => {
  it('writes a described header and one row per year, blank for missing years', () => {
    const csv = seriesCsv({ clue: 'Air temperature', place: 'Arctic', source: 'NASA GISTEMP v4', units: '°C', years: [2003, 2004, 2005], values: [-0.2, null, 0.123456789], stats, url: 'https://example.org/' })
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('# Trend Detective: Air temperature at Arctic')
    expect(lines.filter((l) => l.startsWith('#'))).toHaveLength(6)
    expect(lines.slice(-4)).toEqual(['year,anomaly', '2003,-0.2', '2004,', '2005,0.123457'])
    expect(csv).toContain('0.583 °C per decade (95% range 0.354 to 0.944), p = 0.0004, 23 years')
  })
})

describe('valueUnits', () => {
  it('drops the per-decade part of a trend unit', () => {
    expect(valueUnits('°C/decade')).toBe('°C')
    expect(valueUnits('mm/day per decade')).toBe('mm/day')
    expect(valueUnits('% of soil volume per decade')).toBe('% of soil volume')
  })
})
