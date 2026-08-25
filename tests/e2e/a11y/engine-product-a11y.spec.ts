import { expect, test, type Page } from '@playwright/test'

test.describe('market product accessibility', () => {
  test('the retired engine entry resolves to the catalogue-first home', async ({ page }) => {
    await gotoSettled(page, '/engine')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1, name: 'APIs your agent can discover and call.' })).toBeVisible()
  })

  test('home skip link and primary market search are keyboard reachable', async ({ page }) => {
    await gotoSettled(page, '/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page.getByRole('search', { name: 'Ask Agentic Economy' })).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Describe what you need' })).toBeVisible()
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
    await expect(primary.getByRole('link', { name: 'Connections' })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Activity' })).toBeVisible()
  })

  test('popular searches are labelled, keyboard reachable, and continue into the market', async ({ page }) => {
    await gotoSettled(page, '/')
    const popular = page.getByRole('navigation', { name: 'Popular searches' })
    const popularLink = popular.getByRole('link').first()
    await expect(popular).toBeVisible()
    await popularLink.focus()
    await expect(popularLink).toBeFocused()
    await popularLink.press('Enter')
    await page.waitForURL((url) => (
      url.pathname === '/market'
      && url.searchParams.get('window') === '30d'
      && (url.searchParams.get('query')?.length ?? 0) > 0
    ), { timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Find the right tool for the job.' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search tools' })).toBeVisible()
  })

  test('catalogue and controls do not widen the viewport', async ({ page }) => {
    await gotoSettled(page, '/market?window=30d')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
    await expect(page.getByRole('region', { name: 'Available tools' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Search tools' })).toBeVisible()
  })
})

async function gotoSettled(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
}
