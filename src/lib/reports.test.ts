import { describe, expect, it } from 'vitest'
import { demoDatasets } from '@/data/benchmarks'
import { analyzeWorkload } from './benchmark-stats'
import { datasetFromReport, reportFromDataset, reportSaveError } from './reports'
import { REPORT_SAMPLES_MAX_BYTES, reportsSchema } from '@/schemas/reports-schema'

describe('saved reports', () => {
  it('preserves source samples and recalculates identical statistics after reopening', () => {
    const report = reportFromDataset(demoDatasets[0], 'Compiler run', '', 5)
    expect(report.reviewers).toEqual([])
    expect(report.reviewStatus).toBe('pending')
    const reopened = datasetFromReport('report-1', report)
    expect(reopened.workloads).toEqual(demoDatasets[0].workloads)
    expect(analyzeWorkload(reopened.workloads[0].baseline, reopened.workloads[0].candidate, { threshold: report.threshold, seed: 2027 }))
      .toEqual(analyzeWorkload(demoDatasets[0].workloads[0].baseline, demoDatasets[0].workloads[0].candidate, { threshold: 5, seed: 2027 }))
  })

  it('rejects oversized reports without truncating samples', () => {
    const report = reportFromDataset(demoDatasets[0], 'Large report', '', 5)
    report.samples[0].baseline = Array.from({ length: REPORT_SAMPLES_MAX_BYTES }, () => 1)
    expect(reportSaveError(report)).toContain('Local analysis remains available')
    expect(report.samples[0].baseline).toHaveLength(REPORT_SAMPLES_MAX_BYTES)
  })

  it('enforces private ownership permissions and server-managed identity', () => {
    expect(reportsSchema.ownerField).toBeUndefined()
    expect(reportsSchema.permissions['*']).toEqual({ read: false, create: false, update: false, delete: false })
    expect(reportsSchema.permissions.viewer).toEqual({ read: false, create: false, update: false, delete: false })
    expect(reportsSchema.collaboratorsField).toBe('reviewers')
    expect(reportsSchema.permissions.member).toEqual({ read: 'shared', create: true, update: 'own', delete: 'own' })
    expect(reportsSchema.permissions.admin).toEqual({ read: true, create: true, update: true, delete: true })
  })
})
