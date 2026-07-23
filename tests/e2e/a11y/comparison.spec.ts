import { expect, test } from '@playwright/test'

import { openComparisonFromRegistry } from '../support/comparison'

test.describe('accessible Offering comparison', () => {
  test.setTimeout(60_000)

  test('supports keyboard disclosure, responsive reflow, zoom, and reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const desktopWidthAt100Percent = 1280
    const zoomFactor = 4
    await page.setViewportSize({
      width: desktopWidthAt100Percent / zoomFactor,
      height: 720,
    })
    await openComparisonFromRegistry(page)

    const details = page.locator('details').filter({ hasText: 'See full comparison' })
    const summary = details.getByText('See full comparison', { exact: true })
    await summary.focus()
    await expect(summary).toBeFocused()
    const motion = await summary.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        animationSeconds: parseFloat(style.animationDuration),
        transitionSeconds: parseFloat(style.transitionDuration),
      }
    })
    expect(motion.animationSeconds).toBeLessThanOrEqual(0.001)
    expect(motion.transitionSeconds).toBeLessThanOrEqual(0.001)
    await page.keyboard.press('Enter')
    await expect(details).toHaveAttribute('open', '')

    const mobile = page.locator('[data-comparison-projection="mobile"]')
    const desktop = page.locator('[data-comparison-projection="desktop"]')
    await expect(mobile).toBeVisible()
    await expect(desktop).toBeHidden()
    await expect(mobile.locator('div > dt').first()).toHaveText('Diagnostic plumbing · Business')
    await expect(mobile.locator('div > dd[data-fact-id]').first()).toContainText(
      /Source: .+ · Observed: .+ · Currentness:/,
    )
    expect(await page.evaluate(() => window.innerWidth)).toBe(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

    await expect(page.getByRole('heading', { name: /not ranked|ordered by your priorities/i })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Important comparison notes' })).toBeVisible()
  })
})
