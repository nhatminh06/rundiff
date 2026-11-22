import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByTestId('static-landing')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/\S/)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('thresholds reuse evidence while datasets and same-name imports use fresh samples', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      Object.assign(window, { __workerStarts: 0 })
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options)
          Object.assign(window, { __workerStarts: (window as Window & { __workerStarts: number }).__workerStarts + 1 })
        }
      }
    })
    const count = () => page.evaluate(() => (window as Window & { __workerStarts: number }).__workerStarts)
    await page.goto('/home')
    await expect(page.getByRole('heading', { name: 'Median latency' })).toBeVisible()
    const initial = await count()
    await page.getByLabel('Regression threshold').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('output[for="threshold"]')).toHaveText('6%')
    expect(await count()).toBe(initial)

    await page.getByLabel('Dataset').click()
    await page.getByRole('option', { name: 'Runtime refactor · v0.9 → next' }).click()
    await expect.poll(count).toBeGreaterThan(initial)
    const afterSwitch = await count()
    await page.getByLabel('Dataset').click()
    await page.getByRole('option', { name: 'Compiler optimization · main → PR #284' }).click()
    expect(await count()).toBe(afterSwitch)

    const input = page.locator('input[type="file"]')
    const csv = (candidate: number) => `workload,variant,latency_ms\ngemm,baseline,2\ngemm,candidate,${candidate}\n`
    await input.setInputFiles({ name: 'same.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(2.2)) })
    await expect(page.getByRole('heading', { name: 'gemm', exact: true })).toBeVisible()
    await expect(page.getByText('+10.0%', { exact: true }).first()).toBeVisible()
    const firstImport = await count()
    await input.setInputFiles({ name: 'same.csv', mimeType: 'text/csv', buffer: Buffer.from(csv(3)) })
    await expect(page.getByText('+50.0%', { exact: true }).first()).toBeVisible()
    expect(await count()).toBeGreaterThan(firstImport)
  })

  test('dashboard export includes all workloads despite the status filter', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
    await page.getByLabel('Status filter').click()
    await page.getByRole('option', { name: 'Regression', exact: true }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    const csv = await readFile(await download.path(), 'utf8')
    expect(download.suggestedFilename()).toMatch(/-analysis\.csv$/)
    expect(csv).toContain('Small GEMM,7,7,')
    expect(csv).toContain('Medium GEMM,7,7,')
    expect(csv).toContain('Conv2D,7,7,')
    expect(csv).toContain(',5,regression')
  })

  test('analysis worker startup failure offers a retry', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      let failed = false
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (!failed && String(url).includes('benchmark-worker')) {
            failed = true
            throw new Error('worker unavailable')
          }
          super(url, options)
        }
      }
    })
    await page.goto('/home')
    await expect(page.getByRole('alert')).toContainText('Could not start benchmark analysis')
    await page.getByRole('button', { name: 'Retry analysis' }).click()
    await expect(page.getByRole('heading', { name: 'Median latency' })).toBeVisible()
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})
