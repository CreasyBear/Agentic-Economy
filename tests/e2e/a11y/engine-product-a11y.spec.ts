import { expect, test, type Page } from '@playwright/test'

test.describe('market product accessibility', () => {
  test('the retired engine entry resolves to the catalogue-first home', async ({ page }) => {
    await gotoSettled(page, '/engine')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1, name: 'APIs your agent can discover and call.' })).toBeVisible()
  })

  test('home skip link and primary actions are keyboard reachable', async ({ page }) => {
    await gotoSettled(page, '/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Give this to your agent' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy agent setup instruction' })).toBeVisible()
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
    await expect(primary.getByRole('link', { name: 'Ask' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Discover' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Connections' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Activity' })).toBeVisible()
  })

  test('browse tools continues into the market catalog', async ({ page }) => {
    await gotoSettled(page, '/')
    await page.getByRole('link', { name: 'Browse tools' }).first().click()
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

  test('about is reachable from the footer and keeps public nav', async ({ page }) => {
    await gotoSettled(page, '/')
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('link', { name: 'About' })).toBeVisible()
    await expect(footer.getByRole('link', { name: 'Activity' })).toBeVisible()
    await footer.getByRole('link', { name: 'About' }).click()
    await page.waitForURL('**/about', { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'A market for agent-callable work.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Listed suppliers' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse the live catalog' })).toBeVisible()
    const compact = (page.viewportSize()?.width ?? 1280) < 768
    if (compact) {
      await page.getByRole('button', { name: 'Open public menu' }).click()
    }
    const primary = page.getByRole('navigation', {
      name: compact ? 'Public navigation' : 'Primary',
    })
    await expect(primary.getByRole('link', { name: 'Activity' })).toBeVisible()
  })
})

async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
}
