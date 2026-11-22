import { expect, test } from 'deepspace/testing'
import { readFile } from 'node:fs/promises'

test('owner shares a private report read-only and revocation is realtime', async ({ users }) => {
  const [owner, other] = await users(2)
  const title = `M3 report ${Date.now()}`
  const updatedTitle = `${title} updated`
  const initialDescription = 'Initial qualification report.'
  const updatedDescription = 'Qualified with two authenticated DeepSpace accounts.'
  let reportId: string | null = null

  try {
    await owner.page.goto('/home')
    await owner.page.getByRole('button', { name: 'Save' }).click()
    await expect(owner.page.getByRole('dialog', { name: 'Save comparison report' })).toBeVisible()
    await owner.page.getByLabel('Title').fill(title)
    await owner.page.getByLabel('Description (optional)').fill(initialDescription)
    await owner.page.getByTestId('confirm-save-report').click()
    await expect(owner.page.getByText('Report saved')).toBeVisible()

    await owner.page.goto('/reports')
    const reportButton = owner.page.getByRole('button', { name: new RegExp(title) })
    await expect(reportButton).toBeVisible()
    reportId = await reportButton.getAttribute('data-record-id')
    expect(reportId).toBeTruthy()
    await expect(owner.page.getByText('Recalculated analysis')).toBeVisible()
    await expect(owner.page.getByRole('row', { name: /Small GEMM/ })).toContainText('+11.8%')

    await owner.page.getByLabel('Title').fill(updatedTitle)
    await owner.page.getByLabel('Description').fill(updatedDescription)
    await owner.page.getByLabel('Regression threshold (%)').fill('7')
    await owner.page.getByRole('button', { name: 'Save changes' }).click()
    await expect(owner.page.getByText('Report updated')).toBeVisible()

    await owner.page.reload()
    await expect(owner.page.getByRole('button', { name: new RegExp(updatedTitle) })).toBeVisible()
    await expect(owner.page.getByLabel('Description')).toHaveValue(updatedDescription)
    await expect(owner.page.getByLabel('Regression threshold (%)')).toHaveValue('7')

    await other.page.goto('/reports')
    await expect(other.page.getByText(updatedTitle)).toHaveCount(0)

    await owner.page.getByLabel('Invite reviewer').click()
    await owner.page.getByRole('option', { name: other.name }).click()
    await owner.page.getByRole('button', { name: 'Grant access' }).click()
    await expect(owner.page.getByText('Reviewer invited')).toBeVisible()
    await expect(other.page.getByRole('button', { name: new RegExp(updatedTitle) })).toBeVisible()
    await expect(other.page.getByText('Shared with you as a read-only reviewer.')).toBeVisible()
    await expect(other.page.getByLabel('Title')).toBeDisabled()
    await expect(other.page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(other.page.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    const reviewerDownloadPromise = other.page.waitForEvent('download')
    await other.page.getByRole('button', { name: 'Export CSV' }).click()
    const reviewerDownload = await reviewerDownloadPromise
    const reviewerCsv = await readFile(await reviewerDownload.path(), 'utf8')
    expect(reviewerCsv).toContain('Small GEMM,7,7,')
    expect(reviewerCsv).toContain(',7,regression')

    await other.page.goto(`/reports?testRecordId=${encodeURIComponent(reportId!)}`)
    await other.page.getByRole('button', { name: 'Probe update' }).click()
    await expect(other.page.getByTestId('mutation-probe-result')).toContainText('rejected')
    await owner.page.reload()
    await expect(owner.page.getByLabel('Title')).toHaveValue(updatedTitle)

    await other.page.getByRole('button', { name: 'Probe delete' }).click()
    await expect(other.page.getByTestId('mutation-probe-result')).toContainText('rejected')
    await owner.page.reload()
    await expect(owner.page.getByRole('button', { name: new RegExp(updatedTitle) })).toBeVisible()

    await other.page.getByRole('button', { name: 'Probe sharing' }).click()
    await expect(other.page.getByTestId('mutation-probe-result')).toContainText('rejected')
    await owner.page.reload()
    await expect(owner.page.getByLabel('Invite reviewer')).toBeDisabled()

    await owner.page.getByLabel('Review status').click()
    await owner.page.getByRole('option', { name: 'Investigate' }).click()
    await expect(owner.page.getByText('Review status updated')).toBeVisible()
    await expect(other.page.getByText('investigate', { exact: true })).toBeVisible()

    await owner.page.getByRole('button', { name: `Revoke ${other.name}` }).click()
    await expect(owner.page.getByText('Reviewer removed')).toBeVisible()
    await expect(other.page.getByText(updatedTitle)).toHaveCount(0)
    await expect(other.page.getByText('No saved reports')).toBeVisible()
    await expect(other.page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
    await other.page.reload()
    await expect(other.page.getByText(updatedTitle)).toHaveCount(0)
    await expect(other.page.getByText('No saved reports')).toBeVisible()

    await owner.page.goto(`/reports?testRecordId=${encodeURIComponent(reportId!)}`)
    await owner.page.getByRole('button', { name: 'Probe invalid' }).click()
    await expect(owner.page.getByTestId('mutation-probe-result')).toContainText('rejected')
    await expect(owner.page.getByTestId('mutation-probe-result')).toContainText('at most 200 characters')

  } finally {
    if (reportId) {
      await owner.page.goto('/reports')
      const created = owner.page.locator(`[data-record-id="${reportId}"]`)
      if (await created.count()) {
        await created.click()
        owner.page.once('dialog', (dialog) => dialog.accept())
        await owner.page.getByRole('button', { name: 'Delete' }).click()
        await expect(owner.page.getByText('Report deleted')).toBeVisible()
      }
    }
  }
})

test('authenticated save stays disabled when the records socket is disconnected', async ({ users }) => {
  const [user] = await users(1)
  await user.page.routeWebSocket(/\/ws\//, (socket) => socket.close({ code: 1001, reason: 'qualification disconnect' }))
  await user.page.goto('/home')
  await expect(user.page.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('anonymous visitors cannot access saved reports', async ({ page }) => {
  await page.goto('/reports')
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
  await expect(page.getByText('Saved reports')).toHaveCount(0)
})
