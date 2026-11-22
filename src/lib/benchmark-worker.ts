import { analyzeEvidence, type AnalysisOptions } from './benchmark-stats'
import type { DemoWorkload } from '@/data/benchmarks'

self.onmessage = (event: MessageEvent<{ workloads: DemoWorkload[]; options: AnalysisOptions }>) => {
  const { workloads, options } = event.data
  self.postMessage(workloads.map((workload) => analyzeEvidence(workload.baseline, workload.candidate, options)))
}
