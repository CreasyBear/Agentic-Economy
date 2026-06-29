import { expect, test, type Page } from '@playwright/test'

test.describe('selected protected action accessibility', () => {
  test('owner/admin protected-action routes keep keyboard-visible controls and mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/owner/actions')
    await expect(page.getByRole('heading', { name: /contact follow-up requests need approval/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto('/owner/actions/contact-follow-up%3Amissing-route')
    await expect(page.getByRole('button', { name: /approve contact follow-up/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /reject contact follow-up/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto('/admin/protected-actions')
    await expect(page.getByLabel('Proposal ID')).toBeVisible()
    await expect(page.getByRole('button', { name: /filter/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

async function expectNoHorizontalOverflow(page: Page) {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(hasNoOverflow).toBe(true)
}
