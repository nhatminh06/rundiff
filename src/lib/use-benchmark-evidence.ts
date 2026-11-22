import { useEffect, useState } from 'react'
import type { DemoWorkload } from '@/data/benchmarks'
import type { StatisticalEvidence } from './benchmark-stats'

const cache = new WeakMap<readonly DemoWorkload[], Map<string, StatisticalEvidence[]>>()

export function evidenceCacheKey(seed: number, iterations: number, minimumSamples: number) {
  return `${seed}:${iterations}:${minimumSamples}`
}

export function useBenchmarkEvidence(workloads: readonly DemoWorkload[], seed = 2027, iterations = 2000, minimumSamples = 5) {
  const key = evidenceCacheKey(seed, iterations, minimumSamples)
  const [result, setResult] = useState<{ workloads: readonly DemoWorkload[]; key: string; evidence: StatisticalEvidence[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const evidence = cache.get(workloads)?.get(key) ?? (result?.workloads === workloads && result.key === key ? result.evidence : null)

  useEffect(() => {
    if (cache.get(workloads)?.has(key)) return
    let worker: Worker
    try { worker = new Worker(new URL('./benchmark-worker.ts', import.meta.url), { type: 'module' }) }
    catch { setError('Could not start benchmark analysis in this browser.'); return }
    let active = true
    worker.onmessage = (event: MessageEvent<StatisticalEvidence[]>) => {
      if (!active) return
      const next = cache.get(workloads) ?? new Map<string, StatisticalEvidence[]>()
      next.set(key, event.data)
      cache.set(workloads, next)
      setResult({ workloads, key, evidence: event.data })
      setError(null)
      worker.terminate()
    }
    worker.onerror = () => {
      if (!active) return
      setError('Benchmark analysis failed. Please retry.')
      worker.terminate()
    }
    try { worker.postMessage({ workloads, options: { seed, iterations, minimumSamples } }) }
    catch { setError('Could not send samples for analysis.'); worker.terminate() }
    return () => { active = false; worker.terminate() }
  }, [workloads, key, seed, iterations, minimumSamples, retry])

  return { evidence, error, retry: () => { setError(null); setRetry((value) => value + 1) } }
}
