import { expect, test } from '@playwright/test'

test.describe('authenticated operator shell accessibility', () => {
  test('agent access preserves keyboard recovery and compact layout', async ({ page }) => {
    const stalePrincipal = `prn_${'b'.repeat(32)}`
    await page.goto(`/agent-access?caller=${stalePrincipal}`)

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#operator-main-content')).toBeFocused()

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)

    await expect(page.getByText('Agent not found')).toBeVisible()
    const recover = page.getByRole('button', { name: 'Return to Agents' })
    await recover.focus()
    await expect(async () => {
      await recover.press('Space')
      await expect.poll(() => new URL(page.url()).searchParams.has('caller'), { timeout: 1_000 }).toBe(false)
    }).toPass()
    expect(new URL(page.url()).pathname).toBe('/agent-access')
    await expect(page.getByRole('heading', { name: 'Connect with Codex' })).toBeVisible()
  })
})
