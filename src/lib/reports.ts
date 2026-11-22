import type { DemoDataset, DemoWorkload } from '@/data/benchmarks'
import { REPORT_SAMPLES_MAX_BYTES } from '@/schemas/reports-schema'

export interface ReportData {
  title: string
  description: string
  baselineLabel: string
  candidateLabel: string
  samples: DemoWorkload[]
  threshold: number
  reviewers: string[]
  reviewStatus: 'pending' | 'accepted' | 'investigate'
}

export function reportFromDataset(dataset: DemoDataset, title: string, description: string, threshold: number): ReportData {
  return { title: title.trim(), description: description.trim(), baselineLabel: dataset.baselineLabel, candidateLabel: dataset.candidateLabel, samples: dataset.workloads.map((workload) => ({ ...workload, baseline: [...workload.baseline], candidate: [...workload.candidate] })), threshold, reviewers: [], reviewStatus: 'pending' }
}

export function reportSampleSize(samples: readonly DemoWorkload[]) {
  return new TextEncoder().encode(JSON.stringify(samples)).byteLength
}

export function reportSaveError(report: ReportData): string | null {
  if (!report.title) return 'A report title is required.'
  if (!Number.isFinite(report.threshold) || report.threshold < 0) return 'The regression threshold is invalid.'
  if (report.samples.length === 0 || report.samples.some((item) => item.baseline.length === 0 || item.candidate.length === 0)) return 'Every workload needs baseline and candidate samples.'
  if (report.samples.some((item) => [...item.baseline, ...item.candidate].some((value) => !Number.isFinite(value) || value <= 0))) return 'All saved latencies must be finite numbers greater than zero.'
  const size = reportSampleSize(report.samples)
  return size > REPORT_SAMPLES_MAX_BYTES ? `This report contains ${size.toLocaleString()} bytes of samples; saved reports are limited to ${REPORT_SAMPLES_MAX_BYTES.toLocaleString()} bytes. Local analysis remains available.` : null
}

export function datasetFromReport(id: string, report: ReportData): DemoDataset {
  return { id: `saved-${id}`, name: report.title, context: report.description || 'Saved RunDiff report', baselineLabel: report.baselineLabel, candidateLabel: report.candidateLabel, workloads: report.samples, synthetic: false }
}
