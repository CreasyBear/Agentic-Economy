import { expect, test, type Page } from '@playwright/test'

test.describe('market product accessibility', () => {
  test('the retired engine entry resolves to the catalogue-first market', async ({ page }) => {
    await gotoSettled(page, '/engine')
    await page.waitForURL((url) => (url.pathname === '/market' && url.searchParams.get('window') === '30d'), { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('market skip link and primary actions are keyboard reachable', async ({ page }) => {
    await gotoSettled(page, '/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByLabel('Search Tools').first()).toBeVisible()
    const compact = (page.viewportSize()?.width ?? 1280) < 768
    if (compact) {
      const menu = page.getByRole('button', { name: 'Open public menu' })
      await menu.focus()
      await expect(menu).toBeFocused()
      await menu.press('Enter')
    }
    const primary = page.getByRole('navigation', {
      name: compact ? 'Public navigation' : 'Primary',
    })
    await expect(primary.getByRole('link', { name: 'Discover' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'For agents' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'For Providers' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Calls' })).toBeVisible()
  })

  test('the root resolves to the catalogue with the default window', async ({ page }) => {
    await gotoSettled(page, '/')
    await page.waitForURL((url) => (
      url.pathname === '/market'
      && url.searchParams.get('window') === '30d'
    ), { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('catalogue and controls do not widen the viewport', async ({ page }) => {
    await gotoSettled(page, '/market?window=30d')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('about keeps public nav while the footer points at the marketing site', async ({ page }) => {
    await gotoSettled(page, '/')
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('link', { name: 'About AECON' })).toBeVisible()
    await expect(footer.getByRole('link', { name: 'System status' })).toBeVisible()
    await gotoSettled(page, '/about')
    await expect(page.getByRole('heading', { level: 1, name: 'Who this market is for.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Listed Providers' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse the live catalog' })).toBeVisible()
    const compact = (page.viewportSize()?.width ?? 1280) < 768
    if (compact) {
      // The preceding keyboard-navigation test exercises the drawer itself.
      // Here the menu trigger proves compact navigation is retained on /about.
      await expect(page.getByRole('button', { name: 'Open public menu' })).toBeVisible()
      return
    }
    const primary = page.getByRole('navigation', { name: 'Primary' })
    await expect(primary.getByRole('link', { name: 'Calls' })).toBeVisible()
  })
})

async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
}
