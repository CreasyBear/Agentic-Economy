import { expect, test, type Page } from '@playwright/test'

test.describe('market product accessibility', () => {
  test('market skip link and primary actions are keyboard reachable', async ({ page }) => {
    await gotoSettled(page, '/market?view=tools')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search tools' })
    await expect(search).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(search).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused()
    const browse = page.getByRole('navigation', { name: 'Browse', exact: true })
    for (const name of ['Tools', 'Providers', 'Saved']) {
      await page.keyboard.press('Tab')
      await expect(browse.getByRole('link', { name, exact: true })).toBeFocused()
    }
    const compact = (page.viewportSize()?.width ?? 1280) < 768
    const primary = compact
      ? page.getByRole('dialog', { name: 'Public navigation' }).getByRole('navigation', { name: 'Primary' })
      : page.getByRole('navigation', { name: 'Primary' })
    if (compact) {
      const menu = page.getByRole('button', { name: 'Open public menu' })
      await menu.focus()
      await expect(menu).toBeFocused()
      await menu.press('Enter')
      await expect(primary.getByRole('link', { name: 'Tools', exact: true })).toBeVisible()
    }
    await expect(primary.getByRole('link', { name: 'Tools', exact: true })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'Docs', exact: true })).toBeVisible()
    await expect(primary.getByRole('link', { name: 'For providers' })).toBeVisible()
  })

  test('the landing search reaches the catalogue by keyboard', async ({ page }) => {
    await gotoSettled(page, '/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search tools' })
    await search.fill('weather')
    await search.press('Enter')
    await page.waitForURL((url) => url.pathname === '/market' && url.searchParams.get('query') === 'weather')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('catalogue and controls do not widen the viewport', async ({ page }) => {
    await gotoSettled(page, '/market')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(viewportWidth)
  })

  test('about keeps public navigation and footer home and status links', async ({ page }) => {
    await gotoSettled(page, '/about')
    const footer = page.getByRole('contentinfo')
    const brand = footer.getByRole('link', { name: 'aecon', exact: true })
    await expect(brand).toBeVisible()
    await expect(brand).toHaveAttribute('href', '/')
    const status = footer.getByRole('link', { name: 'Status', exact: true })
    await expect(status).toBeVisible()
    await expect(status).toHaveAttribute('href', '/status')
    await expect(page.getByRole('heading', { level: 1, name: 'Tools agents can call.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Joel Chan' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Browse Tools' })).toBeVisible()
    const compact = (page.viewportSize()?.width ?? 1280) < 768
    if (compact) {
      // The preceding keyboard-navigation test exercises the drawer itself.
      // Here the menu trigger proves compact navigation is retained on /about.
      await expect(page.getByRole('button', { name: 'Open public menu' })).toBeVisible()
      return
    }
    const primary = page.getByRole('navigation', { name: 'Primary' })
    await expect(primary.getByRole('link', { name: 'Tools', exact: true })).toBeVisible()
  })
})

async function gotoSettled(page: Page, path: string) {
  await page.goto(path)
  await page.reload()
  await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()
}
