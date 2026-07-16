import { expect, test } from '@playwright/test'

test.describe('engine product accessibility', () => {
  test('all public Ask AE entry points use the canonical Request home', async ({ page }) => {
    await page.goto('/registry')

    const askLinks = page.getByRole('link', { name: 'Ask AE' })
    await expect(askLinks.first()).toHaveAttribute('href', '/')

    await page.goto('/engine')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1, name: 'What do you need to make happen?' })).toBeVisible()
  })

  test('home skip link and primary engine path are keyboard reachable', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1, name: 'What do you need to make happen?' })).toBeVisible()
    await expect(page.getByLabel('What are you looking for?')).toBeVisible()
  })

  test('request entry is open, labelled, and keyboard reachable without an upfront budget', async ({ page }) => {
    await page.goto('/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'What do you need to make happen?' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('What are you looking for?').fill('Fremantle')
    await expect(page.getByLabel('What are you looking for?')).toHaveValue('Fremantle')
    await expect(page.getByLabel('Maximum spend (AUD)')).toHaveCount(0)
    await page.getByRole('button', { name: 'Start my Request' }).focus()
    await expect(page.getByRole('button', { name: 'Start my Request' })).toBeFocused()
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
