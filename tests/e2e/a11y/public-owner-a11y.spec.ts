import { expect, test } from '@playwright/test'

test.describe('public owner accessibility', () => {
  test('skip link moves keyboard focus to main content', async ({ page }) => {
    await page.goto('/')

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })

  test('claim form exposes labels, error state, and a keyboard submit path', async ({ page }) => {
    await page.goto('/claim')

    await expect(page.getByLabel('Business name')).toBeVisible()
    await expect(page.getByLabel('Service summary')).toBeVisible()
    await expect(page.getByLabel('First request state')).toBeVisible()

    await page.getByRole('button', { name: /publish service page/i }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByText('Business name is required.')).toBeVisible()
    await expect(page.getByLabel('Business name')).toHaveAttribute('aria-invalid', 'true')
  })
})
