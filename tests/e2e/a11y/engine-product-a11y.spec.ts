import { expect, test } from '@playwright/test'

test.describe('engine product accessibility', () => {
  test('home skip link and primary engine path are keyboard reachable', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1, name: 'Start with whatever you know.' })).toBeVisible()
    await expect(page.getByLabel('What are you looking for?')).toBeVisible()
  })

  test('request entry is open, labelled, and keyboard reachable without an upfront budget', async ({ page }) => {
    await page.goto('/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'Start with whatever you know.' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('What are you looking for?').fill('Fremantle')
    await expect(page.getByLabel('What are you looking for?')).toHaveValue('Fremantle')
    await expect(page.getByLabel('Maximum spend (AUD)')).toHaveCount(0)
    await page.getByRole('button', { name: 'Explore' }).focus()
    await expect(page.getByRole('button', { name: 'Explore' })).toBeFocused()
  })

  test('workbench contains wide data without widening the mobile viewport', async ({ page }) => {
    await page.goto('/engine')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
    await expect(page.getByLabel('What are you looking for?')).toBeVisible()
    await expect(page.getByText(/No budget or full specification required/)).toBeVisible()
  })
})
