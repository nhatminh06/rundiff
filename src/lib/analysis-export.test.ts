import { describe, expect, it } from 'vitest'
import { analysisFilename, serializeAnalysisCsv } from './analysis-export'
import type { DemoWorkload } from '@/data/benchmarks'
import type { StatisticalEvidence } from './benchmark-stats'

const workload = (name: string): DemoWorkload => ({ id: name, name, description: '', baseline: [1, 1, 1, 1, 1], candidate: [1.1, 1.1, 1.1, 1.1, 1.1] })
const evidence: StatisticalEvidence = { baselineMedian: 1, candidateMedian: 1.1, baselineP95: 1, candidateP95: 1.1, change: 10.000000000000009, confidenceInterval: { lower: 10.000000000000009, upper: 10.000000000000009 }, warning: null }

describe('analysis CSV export', () => {
  it('exports exact numeric values, units, classifications, and every workload', () => {
    const csv = serializeAnalysisCsv([workload('gemm'), workload('conv2d')], [evidence, evidence], 5)
    expect(csv).toContain('baseline_median_ms,candidate_median_ms,baseline_p95_ms,candidate_p95_ms')
    expect(csv).toContain('median_change_percent,ci95_lower_percent,ci95_upper_percent,regression_threshold_percent,classification')
    expect(csv).toContain('gemm,5,5,1,1.1,1,1.1,10.000000000000009,10.000000000000009,10.000000000000009,5,regression')
    expect(csv).toContain('conv2d,5,5,1,1.1')
    expect(csv.split('\r\n')).toHaveLength(4)
  })

  it('quotes commas, quotes, and newlines and neutralizes spreadsheet formulas', () => {
    const csv = serializeAnalysisCsv([workload('="SUM(1,2)"\nnext')], [evidence], 5)
    expect(csv).toContain('"\'=""SUM(1,2)""\nnext"')
    expect(serializeAnalysisCsv([workload('  @SUM(A1)')], [evidence], 5)).toContain("'  @SUM(A1)")
    expect(serializeAnalysisCsv([workload('\t=1+1')], [evidence], 5)).toContain("'\t=1+1")
  })

  it('marks missing intervals explicitly and preserves the insufficient status', () => {
    const missing = { ...evidence, confidenceInterval: null, warning: 'Too few samples' }
    expect(serializeAnalysisCsv([workload('gemm')], [missing], 5)).toContain('unavailable,unavailable,5,insufficient-data')
  })

  it('rejects empty or malformed workloads and makes safe filenames', () => {
    expect(() => serializeAnalysisCsv([], [], 5)).toThrow('do not match')
    expect(() => serializeAnalysisCsv([workload('gemm')], [], 5)).toThrow('do not match')
    expect(() => serializeAnalysisCsv([{ ...workload('gemm'), baseline: [0] }], [evidence], 5)).toThrow('invalid measurements')
    expect(() => serializeAnalysisCsv([workload('gemm')], [evidence], Number.NaN)).toThrow('threshold')
    expect(analysisFilename('../<report>: 2027')).toBe('report-2027-analysis.csv')
  })
})
