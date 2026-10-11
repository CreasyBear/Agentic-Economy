import { expect, test, type Page } from '@playwright/test'

test.describe('app shell accessibility (S-19)', () => {
  test('skip link moves focus to main-content on Enter', async ({ page }) => {
    await gotoSettledShell(page, '/market')
    await page.keyboard.press('Tab')

    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await skip.press('Enter')

    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
    await expect(mainContent).toHaveAttribute('tabindex', '-1')
  })

  test('dismissing keyboard shortcuts restores focus to the active element', async ({ page }) => {
    await gotoSettledShell(page, '/market')

    const viewport = page.viewportSize()
    const compact = viewport !== null && viewport.width < 768
    const focusTarget = compact
      ? page.getByRole('button', { name: 'Open public menu' })
      : page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tools', exact: true })

    await focusTarget.focus()
    await expect(focusTarget).toBeFocused()
    if (compact) {
      await focusTarget.press('Enter')
      const publicNav = page.getByRole('dialog', { name: 'Public navigation' }).getByRole('navigation', { name: 'Primary' })
      await expect(publicNav).toBeVisible()
      const toolsLink = publicNav.getByRole('link', { name: 'Tools', exact: true })
      await toolsLink.focus()
      await expect(toolsLink).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(publicNav).toHaveCount(0)
      await expect(focusTarget).toBeFocused()
    }

    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
    await expect(focusTarget).toBeFocused()
  })

  test('dismissing command console restores focus after Escape', async ({ page }) => {
    await gotoSettledShell(page, '/market')

    const searchTrigger = page.getByRole('button', { name: 'Find Tools' })
    await searchTrigger.focus()
    await expect(searchTrigger).toBeFocused()

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    await expect(page.getByRole('dialog').first()).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(searchTrigger).toBeFocused()
  })

  test('exposes header, navigation, main, and footer landmarks on an editorial page', async ({ page }) => {
    await gotoSettledShell(page, '/about')

    await expect(page.locator('header[data-shell="app-header"]')).toBeVisible()
    const viewport = page.viewportSize()
    if (viewport !== null && viewport.width < 768) {
      const openMenu = page.getByRole('button', { name: 'Open public menu' })
      await openMenu.focus()
      await openMenu.press('Enter')
      const publicNav = page.getByRole('dialog', { name: 'Public navigation' }).getByRole('navigation', { name: 'Primary' })
      await expect(publicNav).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(publicNav).toHaveCount(0)
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    }
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.locator('#main-content')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
  })
  test('market carries the site footer with keyboard-reachable help and legal links', async ({ page }) => {
    await gotoSettledShell(page, '/market')
    const footer = page.getByRole('contentinfo')
    await expect(footer).toBeVisible()
    const support = footer.getByRole('link', { name: 'Support', exact: true })
    await expect(support).toHaveAttribute('href', '/support')
    await support.focus()
    await expect(support).toBeFocused()
    const privacy = footer.getByRole('link', { name: 'Privacy', exact: true })
    await expect(privacy).toHaveAttribute('href', '/privacy')
    await privacy.focus()
    await expect(privacy).toBeFocused()
    await page.keyboard.press('Tab')
    const terms = footer.getByRole('link', { name: 'Terms', exact: true })
    await expect(terms).toBeFocused()
    await expect(terms).toHaveAttribute('href', '/terms')
  })
})

async function gotoSettledShell(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()
}
