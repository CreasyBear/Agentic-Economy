import { expect, test, type Page } from '@playwright/test'

const phase2ThreadPath = '/owner/inquiries/inquiry_thread%3Ahash%3Af3e29153'

test.describe('public owner accessibility', () => {
  test('skip link moves keyboard focus to main content', async ({ page }) => {
    await page.goto('/')

    await page.keyboard.press('Tab')
    await expect(page.getByTestId('skip-to-content')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
  })

  test('claim form exposes labels, error state, and a keyboard submit path', async ({ page }) => {
    await page.goto('/claim')

    await expect(page.getByLabel('Business name')).toBeVisible()
    await expect(page.getByLabel('Service summary')).toBeVisible()
    await expect(page.getByRole('radio', { name: /First request not available yet/i })).toBeVisible()

    const publishButton = page.getByRole('button', { name: /publish service page/i })
    await expect(publishButton).toBeDisabled()
    await page.getByLabel(/I confirm these public facts/i).check()
    await expect(publishButton).toBeEnabled()
    await publishButton.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByText('Business name is required.')).toBeVisible()
    await expect(page.getByLabel('Business name')).toHaveAttribute('aria-invalid', 'true')
  })

  test('phase 2 inquiry and operator surfaces keep keyboard focus and compact layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/plumbing-demo/inquiry')
    await expect(page.getByLabel('Contact details for the business reply')).toBeVisible()
    await expect(page.getByLabel('Describe the job')).toBeVisible()

    const submitButton = page.getByRole('button', { name: /send job details/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Message is required.')).toBeVisible()
    await expect(page.getByLabel('Describe the job')).toBeFocused()
    await expectNoHorizontalOverflow(page)

    await page.goto(phase2ThreadPath)
    await expect(page.getByRole('button', { name: /mark read/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^reply$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /close inquiry/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /repair|retry/i })).toHaveCount(0)
    await expect(page.getByText(/^Delivery status$/)).toBeVisible()

    const replyButton = page.getByRole('button', { name: /^reply$/i })
    await expect(replyButton).toBeEnabled()
    await replyButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#ownerReply-error')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Owner reply' })).toBeFocused()
    await expectNoHorizontalOverflow(page)

    await page.goto('/admin/inquiries')
    await expect(page.getByLabel('Thread ID')).toBeVisible()
    await expect(page.getByLabel('Correlation ID')).toBeVisible()
    await expect(page.getByLabel('Dispatch ID')).toBeVisible()
    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible()
    await expect(page.getByText(/Source hash/i).first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

async function expectNoHorizontalOverflow(page: Page) {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(hasNoOverflow).toBe(true)
}
