import { describe, expect, it } from 'vitest'
import { CSV_LIMITS, importBenchmarkCsv } from './benchmark-csv'

const header = 'workload,variant,latency_ms\n'

describe('benchmark CSV import', () => {
  it('groups valid rows and keeps duplicates as independent measurements', () => {
    const result = importBenchmarkCsv(`${header}gemm,baseline,2.1\ngemm,baseline,2.1\ngemm,candidate,2.4`, 'run.csv')
    expect(result.workloads[0].baseline).toEqual([2.1, 2.1])
    expect(result.workloads[0].candidate).toEqual([2.4])
    expect(result.synthetic).toBe(false)
  })

  it('parses quoted fields, escaped quotes, and CRLF', () => {
    const result = importBenchmarkCsv('workload,variant,latency_ms\r\n"gemm, ""tiny""",baseline,2.1\r\n"gemm, ""tiny""",candidate,2.4\r\n', 'quoted.csv')
    expect(result.workloads[0].name).toBe('gemm, "tiny"')
  })

  it('rejects missing and malformed headers', () => {
    expect(() => importBenchmarkCsv('', 'empty.csv')).toThrow('empty')
    expect(() => importBenchmarkCsv('workload,latency_ms\ngemm,2', 'bad.csv')).toThrow('Row 1')
  })

  it('rejects unmatched variants', () => {
    expect(() => importBenchmarkCsv(`${header}gemm,baseline,2.1`, 'bad.csv')).toThrow('both baseline and candidate')
  })

  it.each(['', '0', '-1', 'NaN', 'Infinity'])('rejects invalid latency %j with its row number', (latency) => {
    expect(() => importBenchmarkCsv(`${header}gemm,baseline,${latency}\ngemm,candidate,2`, 'bad.csv')).toThrow('Row 2')
  })

  it('enforces file and row limits', () => {
    expect(() => importBenchmarkCsv(header, 'large.csv', CSV_LIMITS.maxBytes + 1)).toThrow('byte limit')
    const rows = Array.from({ length: CSV_LIMITS.maxRows + 1 }, () => 'gemm,baseline,1').join('\n')
    expect(() => importBenchmarkCsv(header + rows, 'many.csv')).toThrow('data-row limit')
  })
})
