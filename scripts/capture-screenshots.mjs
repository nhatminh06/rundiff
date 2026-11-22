import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const origin = process.env.RUNDIFF_BENCH_ORIGIN ?? 'http://127.0.0.1:5188'
const browser = await chromium.launch({ headless: true })
try {
  await mkdir('screenshots', { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(`${origin}/home`)
    await page.getByRole('heading', { name: 'Median latency' }).waitFor()
    await page.getByText('Synthetic demo data').first().waitFor()
    await page.screenshot({ path: `screenshots/dashboard-${name}.png`, fullPage: true })
    await page.close()
  }
} finally {
  await browser.close()
}
