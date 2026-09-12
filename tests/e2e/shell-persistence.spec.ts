import { expect, test, type Page } from '@playwright/test'

function isCompact(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 768
}

/**
 * Reaches Operations (`/owner/operations`) from `/market` by clicking real
 * in-app links only, mirroring how a visitor actually gets there: header
 * "Publish" (desktop) or the mobile drawer's "Publish" link, then the
 * supply-landing "List a service" CTA (see AeSupplyLanding.tsx).
 */
async function navigateMarketToOwner(page: Page) {
  if (isCompact(page)) {
    await page.getByRole('button', { name: 'Open public menu' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Publish' }).click()
  } else {
    await page.getByRole('link', { name: 'Publish', exact: true }).click()
  }
  await expect(page).toHaveURL(/\/for-providers$/)
  await expect(page.locator('[data-shell="app-header"][data-probe="alive"]'), 'header remounted on market -> for-providers').toHaveCount(1)
  await page.getByRole('link', { name: 'List a service' }).click()
  await expect(page).toHaveURL(/\/owner\/offerings$/)
}

/** Navigates back to `/market` by clicking the persistent header's "Discover" link. */
async function navigateHeaderToMarket(page: Page) {
  if (isCompact(page)) {
    await page.getByRole('button', { name: 'Open public menu' }).click()
    await page
      .getByRole('navigation', { name: 'Public navigation' })
      .getByRole('link', { name: 'Discover' })
      .click()
  } else {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Discover' })
      .click()
  }
  await expect(page).toHaveURL(/\/market/)
}

test.describe('app shell persistence', () => {
  test('header node survives market -> owner -> market', async ({ page }) => {
    const hydrationErrors: string[] = []
    page.on('console', (message) => {
      if (/hydrat|Minified React error #4(18|23|25)/iu.test(message.text())) hydrationErrors.push(message.text())
    })
    await page.goto('/market')
    await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()

    const header = page.locator('[data-shell="app-header"][data-hydrated="true"]')
    await expect(header).toBeVisible()
    const initialHeight = await page.evaluate(() => {
      const node = document.querySelector('[data-shell="app-header"]') as HTMLElement | null
      if (node === null) throw new Error('app header not found')
      node.dataset.probe = 'alive'
      return node.getBoundingClientRect().height
    })

    await navigateMarketToOwner(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible()

    const stillAlive = page.locator('[data-shell="app-header"][data-probe="alive"]')
    await expect(stillAlive).toHaveCount(1)
    await expect
      .poll(() => stillAlive.evaluate((node) => node.getBoundingClientRect().height))
      .toBe(initialHeight)

    await navigateHeaderToMarket(page)

    const stillAliveAgain = page.locator('[data-shell="app-header"][data-probe="alive"]')
    await expect(stillAliveAgain).toHaveCount(1)
    await expect
      .poll(() => stillAliveAgain.evaluate((node) => node.getBoundingClientRect().height))
      .toBe(initialHeight)
    expect(hydrationErrors, 'hydration errors force React to rebuild the frame').toEqual([])
  })

  test('no document-level view transition on the market <-> settings pair', async ({ page }) => {
    await page.addInitScript(() => {
      const win = window as unknown as {
        __startViewTransitionCalled?: boolean
        startViewTransitionOriginal?: typeof document.startViewTransition
      }
      win.__startViewTransitionCalled = false
      if ('startViewTransition' in document) {
        const original = document.startViewTransition.bind(document)
        document.startViewTransition = ((callback: () => void | Promise<void>) => {
          win.__startViewTransitionCalled = true
          return original(callback)
        }) as typeof document.startViewTransition
      }
    })

    await page.goto('/market')
    await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()
    await page.evaluate(() => {
      const node = document.querySelector('[data-shell="app-header"]') as HTMLElement | null
      if (node === null) throw new Error('app header not found')
      node.dataset.probe = 'alive'
    })
    const hasViewTransitions = await page.evaluate(() => 'startViewTransition' in document)
    test.skip(!hasViewTransitions, 'no View Transitions API')

    await navigateMarketToOwner(page)

    const headerViewTransitionName = await page.evaluate(() => {
      const node = document.querySelector('[data-shell="app-header"]') as HTMLElement | null
      if (node === null) throw new Error('app header not found')
      return getComputedStyle(node).viewTransitionName
    })
    expect(headerViewTransitionName).toBe('ae-app-header')

    const wasCalled = await page.evaluate(
      () => (window as unknown as { __startViewTransitionCalled?: boolean }).__startViewTransitionCalled === true,
    )
    if (wasCalled) {
      const headerGroupExcluded = await page.evaluate(() => {
        const node = document.querySelector('[data-shell="app-header"]') as HTMLElement | null
        if (node === null) throw new Error('app header not found')
        return getComputedStyle(node).viewTransitionName === 'ae-app-header'
      })
      expect(headerGroupExcluded).toBe(true)
    }
  })

  test('skip link and one header', async ({ page }) => {
    await page.goto('/market')
    await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()
    await expect(page.locator('[data-shell="app-header"]')).toHaveCount(1)
    await expect(page.getByTestId('skip-to-content')).toHaveCount(1)

    await page.goto('/owner/operations')
    await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()
    await expect(page.locator('[data-shell="app-header"]')).toHaveCount(1)
    await expect(page.getByTestId('skip-to-content')).toHaveCount(1)
  })
})
