import { describe, expect, it } from 'vitest'
import { analyzeEvidence, analyzeWorkload, bootstrapMedianChange, classifyChange, classifyEvidence, median, percentile, percentageChange } from './benchmark-stats'
import { evidenceCacheKey } from './use-benchmark-evidence'

describe('benchmark statistics', () => {
  it('calculates odd and even medians without mutating input', () => {
    const values = [9, 1, 5, 3]
    expect(median([8, 2, 4])).toBe(4)
    expect(median(values)).toBe(4)
    expect(values).toEqual([9, 1, 5, 3])
  })

  it('uses the documented nearest-rank percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 95)).toBe(19)
    expect(percentile([4, 1, 3, 2], 50)).toBe(2)
  })

  it('reports positive regressions and negative improvements', () => {
    expect(percentageChange(10, 11)).toBeCloseTo(10)
    expect(percentageChange(10, 8)).toBeCloseTo(-20)
  })

  it('produces deterministic bootstrap intervals with manually derivable constant samples', () => {
    const first = bootstrapMedianChange([10, 10, 10, 10, 10], [11, 11, 11, 11, 11], { seed: 42, iterations: 200 })
    expect(first).toEqual({ lower: 10.000000000000009, upper: 10.000000000000009 })
    expect(bootstrapMedianChange([10, 10, 10, 10, 10], [11, 11, 11, 11, 11], { seed: 42, iterations: 200 })).toEqual(first)
  })

  it('classifies strict confidence and observed-change boundaries', () => {
    expect(classifyChange(8, { lower: 5.01, upper: 12 }, 5)).toBe('regression')
    expect(classifyChange(8, { lower: 5, upper: 12 }, 5)).toBe('investigation')
    expect(classifyChange(5, { lower: 1, upper: 9 }, 5)).toBe('no-clear-regression')
    expect(classifyChange(-8, { lower: -12, upper: -4 }, 5)).toBe('no-clear-regression')
  })

  it('warns when either variant has too few samples', () => {
    const result = analyzeWorkload([1, 1, 1, 1], [2, 2, 2, 2, 2])
    expect(result.status).toBe('insufficient-data')
    expect(result.confidenceInterval).toBeNull()
    expect(result.warning).toContain('5 valid samples')
  })

  it('rejects zero, invalid, and missing measurements', () => {
    expect(median([])).toBeNull()
    expect(median([0, 1])).toBeNull()
    expect(median([Number.NaN])).toBeNull()
    expect(percentageChange(0, 4)).toBeNull()
    expect(percentageChange(null, 4)).toBeNull()
  })

  it('returns deterministic median results', () => {
    expect(median([5, 1, 4, 2, 3])).toBe(median([3, 5, 2, 1, 4]))
  })

  it('reclassifies the same evidence at different thresholds without changing the interval', () => {
    const baseline = [10, 10, 10, 10, 10]
    const candidate = [11, 11, 11, 11, 11]
    const evidence = analyzeEvidence(baseline, candidate)
    expect(evidence.confidenceInterval).toEqual({ lower: 10.000000000000009, upper: 10.000000000000009 })
    expect(classifyEvidence(evidence, 5)).toEqual(analyzeWorkload(baseline, candidate, { threshold: 5 }))
    expect(classifyEvidence(evidence, 10).status).toBe('regression')
    expect(classifyEvidence(evidence, 11).status).toBe('no-clear-regression')
    expect(evidenceCacheKey(2027, 2000, 5)).not.toBe(evidenceCacheKey(2028, 2000, 5))
    expect(evidenceCacheKey(2027, 2000, 5)).not.toBe(evidenceCacheKey(2027, 1000, 5))
    expect(evidenceCacheKey(2027, 2000, 5)).not.toBe(evidenceCacheKey(2027, 2000, 6))
  })
})
