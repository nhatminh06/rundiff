import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const errors = []
const origin = process.env.RUNDIFF_QA_ORIGIN ?? 'https://rundiff-minh-2027.app.space'
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin}/`)
  await page.getByTestId('static-landing').waitFor()
  const landing = await page.locator('h1').first().textContent()
  await page.goto(`${origin}/home`)
  await page.getByRole('heading', { name: 'Median latency' }).waitFor()
  const initial = await page.getByRole('heading', { name: 'Small GEMM' }).count()
  await page.getByLabel('Dataset').click()
  await page.getByRole('option', { name: 'Runtime refactor · v0.9 → next' }).click()
  await page.getByLabel('Regression threshold').focus()
  await page.keyboard.press('ArrowRight')
  const threshold = await page.locator('output[for="threshold"]').textContent()
  const csv = 'workload,variant,latency_ms\ngemm,baseline,2\ngemm,candidate,3\n'
  await page.locator('input[type="file"]').setInputFiles({ name: 'qa-synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('heading', { name: 'gemm', exact: true }).waitFor()
  const imported = await page.getByText('+50.0%', { exact: true }).count()
  const exportPresent = await page.getByRole('button', { name: 'Export CSV' }).count()
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    wideElements: [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 10).map((element) => ({ tag: element.tagName, className: String(element.className).slice(0, 100) })),
  }))
  process.stdout.write(`${JSON.stringify({ origin, landing, initial, threshold, imported, exportPresent, mobile, errors }, null, 2)}\n`)
} finally {
  await browser.close()
}
