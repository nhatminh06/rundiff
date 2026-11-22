import type { DemoWorkload } from '@/data/benchmarks'
import { classifyEvidence, type StatisticalEvidence } from './benchmark-stats'

const headers = [
  'workload', 'baseline_samples', 'candidate_samples', 'baseline_median_ms',
  'candidate_median_ms', 'baseline_p95_ms', 'candidate_p95_ms',
  'median_change_percent', 'ci95_lower_percent', 'ci95_upper_percent',
  'regression_threshold_percent', 'classification',
]

function cell(value: string | number | null): string {
  if (value === null) return 'unavailable'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Analysis contains a nonfinite value.')
    return String(value)
  }
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function serializeAnalysisCsv(workloads: readonly DemoWorkload[], evidence: readonly StatisticalEvidence[], threshold: number): string {
  if (!workloads.length || workloads.length !== evidence.length) throw new Error('Analysis and workload rows do not match.')
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Regression threshold is invalid.')
  const rows = workloads.map((workload, index) => {
    if (!workload.name.trim() || !workload.baseline.length || !workload.candidate.length ||
      [...workload.baseline, ...workload.candidate].some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error(`Workload ${index + 1} has invalid measurements.`)
    }
    const item = evidence[index]
    const status = classifyEvidence(item, threshold).status
    return [
      workload.name, workload.baseline.length, workload.candidate.length,
      item.baselineMedian, item.candidateMedian, item.baselineP95, item.candidateP95,
      item.change, item.confidenceInterval?.lower ?? null, item.confidenceInterval?.upper ?? null,
      threshold, status,
    ].map(cell).join(',')
  })
  return `${headers.join(',')}\r\n${rows.join('\r\n')}\r\n`
}

export function analysisFilename(label: string): string {
  const safe = label.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80)
  return `${safe || 'rundiff'}-analysis.csv`
}

export function downloadAnalysisCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
