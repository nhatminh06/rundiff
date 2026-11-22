export type WorkloadStatus = 'regression' | 'investigation' | 'no-clear-regression' | 'insufficient-data'
export interface ConfidenceInterval { lower: number; upper: number }
export interface AnalysisOptions { threshold?: number; seed?: number; iterations?: number; minimumSamples?: number }
export interface WorkloadAnalysis { baselineMedian: number | null; candidateMedian: number | null; baselineP95: number | null; candidateP95: number | null; change: number | null; confidenceInterval: ConfidenceInterval | null; status: WorkloadStatus; warning: string | null }
export type StatisticalEvidence = Omit<WorkloadAnalysis, 'status'>

export function median(measurements: readonly number[]): number | null {
  if (!validMeasurements(measurements)) return null
  const sorted = [...measurements].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Nearest-rank percentile: rank = ceil(p / 100 * n), clamped to the sample range. */
export function percentile(measurements: readonly number[], p: number): number | null {
  if (!validMeasurements(measurements) || !Number.isFinite(p) || p < 0 || p > 100) return null
  const sorted = [...measurements].sort((a, b) => a - b)
  if (p === 0) return sorted[0]
  return sorted[Math.ceil((p / 100) * sorted.length) - 1]
}

export function percentageChange(baseline: number | null, candidate: number | null): number | null {
  if (baseline === null || candidate === null || !Number.isFinite(baseline) || !Number.isFinite(candidate) || baseline <= 0 || candidate <= 0) return null
  return (candidate / baseline - 1) * 100
}

/** Independent percentile bootstrap of median change using deterministic Mulberry32 random values. */
export function bootstrapMedianChange(baseline: readonly number[], candidate: readonly number[], { seed = 2027, iterations = 2000 }: Pick<AnalysisOptions, 'seed' | 'iterations'> = {}): ConfidenceInterval | null {
  if (!validMeasurements(baseline) || !validMeasurements(candidate) || !Number.isInteger(iterations) || iterations < 100 || !Number.isInteger(seed)) return null
  const random = mulberry32(seed)
  const changes = Array.from({ length: iterations }, () => percentageChange(median(resample(baseline, random)), median(resample(candidate, random))) as number).sort((a, b) => a - b)
  return { lower: interpolatedQuantile(changes, 0.025), upper: interpolatedQuantile(changes, 0.975) }
}

export function analyzeEvidence(baseline: readonly number[], candidate: readonly number[], options: AnalysisOptions = {}): StatisticalEvidence {
  const minimumSamples = options.minimumSamples ?? 5
  const baselineMedian = median(baseline)
  const candidateMedian = median(candidate)
  const baselineP95 = percentile(baseline, 95)
  const candidateP95 = percentile(candidate, 95)
  const change = percentageChange(baselineMedian, candidateMedian)
  const insufficient = baseline.length < minimumSamples || candidate.length < minimumSamples || change === null
  const confidenceInterval = insufficient ? null : bootstrapMedianChange(baseline, candidate, options)
  return { baselineMedian, candidateMedian, baselineP95, candidateP95, change, confidenceInterval, warning: insufficient ? `At least ${minimumSamples} valid samples per variant are required for bootstrap analysis.` : null }
}

export function classifyEvidence(evidence: StatisticalEvidence, threshold = 5): WorkloadAnalysis {
  return { ...evidence, status: classifyChange(evidence.change, evidence.confidenceInterval, threshold, evidence.warning !== null) }
}

export function analyzeWorkload(baseline: readonly number[], candidate: readonly number[], options: AnalysisOptions = {}): WorkloadAnalysis {
  return classifyEvidence(analyzeEvidence(baseline, candidate, options), options.threshold)
}

export function classifyChange(change: number | null, interval: ConfidenceInterval | null, threshold = 5, insufficient = false): WorkloadStatus {
  if (insufficient || change === null || interval === null || !Number.isFinite(threshold) || threshold < 0) return 'insufficient-data'
  if (interval.lower > threshold) return 'regression'
  if (change > threshold) return 'investigation'
  return 'no-clear-regression'
}

function validMeasurements(values: readonly number[]) { return values.length > 0 && values.every((value) => Number.isFinite(value) && value > 0) }
function resample(values: readonly number[], random: () => number) { return Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]) }
function interpolatedQuantile(sorted: readonly number[], probability: number) { const position = (sorted.length - 1) * probability; const lower = Math.floor(position); const fraction = position - lower; return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction }
function mulberry32(seed: number) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296 } }
