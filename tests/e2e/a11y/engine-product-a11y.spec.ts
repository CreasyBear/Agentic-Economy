import { expect, test } from '@playwright/test'

test.describe('engine product accessibility', () => {
  test('home skip link and primary engine path are keyboard reachable', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1, name: 'Give the job to the right endpoint.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Route a request' })).toBeVisible()
  })

  test('workbench has persistent labels and generates the exact request envelope', async ({ page }) => {
    await page.goto('/engine')
    await expect(page.getByRole('heading', { level: 1, name: 'Turn an intent into an approvable plan.' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('What outcome do you want?').fill('Query three freight providers.')
    await page.getByLabel('Maximum spend').fill('42.50')
    await expect(page.getByLabel('Maximum spend')).toHaveValue('42.50')
    await expect(page.locator('pre')).toContainText('"maximumSpendMinor": 4250')
    await expect(page.locator('pre')).toContainText('Query three freight providers.')
    await page.getByRole('button', { name: 'Copy JSON' }).focus()
    await expect(page.getByRole('button', { name: 'Copy JSON' })).toBeFocused()
  })

  test('workbench contains wide data without widening the mobile viewport', async ({ page }) => {
    await page.goto('/engine')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
    await expect(page.getByLabel('What outcome do you want?')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Six operations. One routing contract.' })).toBeVisible()
  })
})
