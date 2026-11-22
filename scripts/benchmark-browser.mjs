import { chromium } from '@playwright/test'

const origin = process.env.RUNDIFF_BENCH_ORIGIN ?? 'http://127.0.0.1:5188'
const legacy = process.env.RUNDIFF_BENCH_LEGACY === '1'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${origin}/home`)
  const measurements = await page.evaluate(async ({ legacy }) => {
    const stats = await import('/src/lib/benchmark-stats.ts')
    const { importBenchmarkCsv } = await import('/src/lib/benchmark-csv.ts')
    const makeCsv = (count) => [
      'workload,variant,latency_ms',
      ...Array.from({ length: count }, (_, i) => `gemm,baseline,${2 + (i % 17) / 100}`),
      ...Array.from({ length: count }, (_, i) => `gemm,candidate,${2.2 + (i % 19) / 100}`),
    ].join('\n')
    const timed = async (work) => {
      const start = performance.now()
      const timer = new Promise((resolve) => setTimeout(() => resolve(performance.now() - start), 0))
      work()
      const duration = performance.now() - start
      const timerDelay = await timer
      return { durationMs: +duration.toFixed(1), timerDelayMs: +timerDelay.toFixed(1) }
    }
    const cases = []
    for (const count of [50, 500, 2500, 5000]) {
      const csv = makeCsv(count)
      let dataset
      const parse = await timed(() => { dataset = importBenchmarkCsv(csv, 'benchmark.csv') })
      const workload = dataset.workloads[0]
      let evidence
      const analysis = await timed(() => {
        evidence = !legacy && stats.analyzeEvidence
          ? stats.analyzeEvidence(workload.baseline, workload.candidate, { seed: 2027, iterations: 2000 })
          : stats.analyzeWorkload(workload.baseline, workload.candidate, { threshold: 5, seed: 2027, iterations: 2000 })
      })
      const threshold = await timed(() => {
        for (let value = 1; value <= 15; value++) {
          if (!legacy && stats.classifyEvidence) stats.classifyEvidence(evidence, value)
          else stats.analyzeWorkload(workload.baseline, workload.candidate, { threshold: value, seed: 2027, iterations: 2000 })
        }
      })
      cases.push({ samplesPerVariant: count, csvRows: count * 2, csvBytes: new TextEncoder().encode(csv).length, parse, analysis, threshold15Changes: threshold })
    }
    return { mode: legacy ? 'legacy repeated bootstrap' : 'reuse evidence', userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, cases }
  }, { legacy })
  const csv = [
    'workload,variant,latency_ms',
    ...Array.from({ length: 5000 }, (_, i) => `gemm,baseline,${2 + (i % 17) / 100}`),
    ...Array.from({ length: 5000 }, (_, i) => `gemm,candidate,${2.2 + (i % 19) / 100}`),
  ].join('\n')
  await page.evaluate(() => {
    window.__benchmarkPulse = { started: performance.now(), last: performance.now(), maxDelay: 0 }
    window.__benchmarkPulse.timer = setInterval(() => {
      const now = performance.now()
      window.__benchmarkPulse.maxDelay = Math.max(window.__benchmarkPulse.maxDelay, now - window.__benchmarkPulse.last - 10)
      window.__benchmarkPulse.last = now
    }, 10)
  })
  await page.locator('input[type="file"]').setInputFiles({ name: 'benchmark.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('heading', { name: 'gemm', exact: true }).waitFor({ timeout: 30_000 })
  measurements.uiImport = await page.evaluate(() => {
    clearInterval(window.__benchmarkPulse.timer)
    return { durationMs: +(performance.now() - window.__benchmarkPulse.started).toFixed(1), maxTimerDelayMs: +window.__benchmarkPulse.maxDelay.toFixed(1) }
  })
  process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`)
} finally {
  await browser.close()
}
