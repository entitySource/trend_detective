import { describe, expect, it } from 'vitest'
import { chancePercent, inPlace, interpret, intervalDirection, recordLength, signalStrength, significance } from './readings'

describe('thresholds', () => {
  it('reads p-values against the 5% level', () => {
    expect(significance(0.004)?.label).toMatch(/^Highly significant/)
    expect(significance(0.013)?.label).toMatch(/^Significant/)
    expect(significance(0.07)?.tone).toBe('moderate')
    expect(significance(0.4)?.tone).toBe('weak')
    expect(significance(null)).toBeNull()
  })
  it('turns p into a picture-able percentage', () => {
    expect(chancePercent(0.013)).toBe('1.3%')
    expect(chancePercent(0.42)).toBe('42%')
    expect(chancePercent(0.0002)).toBe('less than 0.1%')
  })
  it('rates signal-to-noise and record length', () => {
    expect(signalStrength(1.2)?.tone).toBe('strong')
    expect(signalStrength(-0.7)?.tone).toBe('moderate')
    expect(signalStrength(0.2)?.tone).toBe('weak')
    expect(recordLength(30).tone).toBe('strong')
    expect(recordLength(23).tone).toBe('moderate')
    expect(recordLength(14).tone).toBe('weak')
  })
  it('checks whether the interval excludes zero', () => {
    expect(intervalDirection(9.35, 28)).toBe('up')
    expect(intervalDirection(-3, -1)).toBe('down')
    expect(intervalDirection(-1, 2)).toBe('unclear')
    expect(intervalDirection(null, 2)).toBeNull()
  })
})

describe('inPlace', () => {
  it('puts the article where English needs it', () => {
    expect(inPlace('Sahel')).toBe('in the Sahel')
    expect(inPlace('Arctic')).toBe('in the Arctic')
    expect(inPlace('Europe')).toBe('in Europe')
    expect(inPlace('Whole world')).toBe('across the whole world')
  })
})

describe('interpret', () => {
  const base = { clue: 'sea level', place: 'Siberia', units: 'mm', from: 2003, to: 2025, slopePerDecade: 17.9, totalChange: 39.4, p: 0.013, snr: 1.2, ciLow: 9.35, ciHigh: 28.0, n: 23 }
  it('explains a significant rise with units and the interval', () => {
    const text = interpret(base).join(' ')
    expect(text).toContain('Sea level in Siberia rose by about 17.9 mm per decade between 2003 and 2025 (about 39.4 mm in total).')
    expect(text).toContain('only 1.3% of the time, so it is statistically significant')
    expect(text).toContain('stays above zero')
  })
  it('explains a result that is not significant', () => {
    const text = interpret({ ...base, slopePerDecade: -2, totalChange: -4.4, p: 0.42, snr: 0.2, ciLow: -8, ciHigh: 3, n: 14 }).join(' ')
    expect(text).toContain('fell by about 2 mm per decade')
    expect(text).toContain('not statistically significant')
    expect(text).toContain('includes zero')
    expect(text).toContain('only 14 years')
  })
})
