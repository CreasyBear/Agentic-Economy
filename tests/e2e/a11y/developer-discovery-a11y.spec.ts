import { expect, test, type Page } from '@playwright/test'

test.describe('developer discovery accessibility', () => {
  test('artifact links and compact status rows stay keyboard reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoSettled(page, '/developers/discovery')

    await expect(page.getByRole('heading', { name: 'Discovery status', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View schema status' })).toBeVisible()
    await expect(page.getByText(/read path status/i)).toBeVisible()

    const skipLink = page.getByRole('link', { name: /skip to content/i })
    const mainContent = page.locator('#main-content')

    await expect(page.getByRole('main')).toBeVisible()
    await expect(mainContent).toHaveAttribute('tabindex', '-1')
    await expect(skipLink).toHaveAttribute('href', '#main-content')
    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(mainContent).toBeFocused()

    await page.getByRole('link', { name: 'View schema status' }).focus()
    await expect(page.getByRole('link', { name: 'View schema status' })).toBeFocused()
    await expectNoHorizontalOverflow(page)
  })
})

async function expectNoHorizontalOverflow(page: Page) {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(hasNoOverflow).toBe(true)
}

async function gotoSettled(page: Page, path: string) {
  await page.goto(path)
  await page.reload()
}
