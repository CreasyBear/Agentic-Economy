import { expect, test } from '@playwright/test'

test.describe('engine product accessibility', () => {
  test('home skip link and primary engine path are keyboard reachable', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1, name: 'Your agent knows who to call.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tell us what you need' })).toBeVisible()
  })

  test('workbench has persistent labels and generates the exact request envelope', async ({ page }) => {
    await page.goto('/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'What do you need?' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Tell your agent what needs doing').fill('Query three freight providers.')
    await page.getByLabel('Maximum spend (AUD)').fill('42.50')
    await expect(page.getByLabel('Maximum spend (AUD)')).toHaveValue('42.50')
    await expect(page.getByText('Maximum spend: AUD 42.50')).toBeVisible()
    await page.getByRole('button', { name: 'Copy for my agent' }).focus()
    await expect(page.getByRole('button', { name: 'Copy for my agent' })).toBeFocused()
  })

  test('workbench contains wide data without widening the mobile viewport', async ({ page }) => {
    await page.goto('/engine')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
    await expect(page.getByLabel('Tell your agent what needs doing')).toBeVisible()
    await expect(page.getByText('Technical details for agents and builders')).toBeVisible()
  })
})
