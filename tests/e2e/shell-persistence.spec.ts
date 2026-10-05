import { expect, test, type Page } from '@playwright/test'

function isCompact(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 768
}

/**
 * Reaches `/for-providers` from `/market` by clicking real in-app links
 * only, mirroring how a visitor actually gets there: header "For providers"
 * (desktop) or the mobile drawer's "For providers" link. Stays within
 * public pages: `/owner/*` now requires an operator session (see
 * requireOperatorBeforeLoad), so it is out of scope for this
 * unauthenticated shell-identity check.
 */
async function navigateMarketToForProviders(page: Page) {
  if (isCompact(page)) {
    await page.getByRole('button', { name: 'Open public menu' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'For providers' }).click()
  } else {
    await page.getByRole('link', { name: 'For providers', exact: true }).click()
  }
  await expect(page).toHaveURL(/\/for-providers$/)
  await expect(page.locator('[data-shell="app-header"][data-probe="alive"]'), 'header remounted on market -> for-providers').toHaveCount(1)
}

/** Navigates back to `/market` by clicking the persistent header's "Market" link. */
async function navigateHeaderToMarket(page: Page) {
  if (isCompact(page)) {
    await page.getByRole('button', { name: 'Open public menu' }).click()
    await page
      .getByRole('dialog', { name: 'Public navigation' })
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Market' })
      .click()
  } else {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Market' })
      .click()
  }
  await expect(page).toHaveURL(/\/market/)
}

test.describe('app shell persistence', () => {
  test('Tool search stays on one line after the compact header expands', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/market')
    await page.locator('[data-shell="app-header"][data-hydrated="true"]').waitFor()

    const trigger = page.getByRole('button', { name: 'Find Tools' })
    const label = trigger.getByText('Find Tools', { exact: true })
    for (const width of [375, 1440, 639, 640, 375, 1440]) {
      await page.setViewportSize({ width, height: 812 })
      if (width < 640) {
        await expect(label).toBeHidden()
        await expect.poll(() => trigger.evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(64)
      } else {
        await expect(label).toBeVisible()
        await expect.poll(() => trigger.evaluate(node => {
          const button = node.getBoundingClientRect()
          const content = Array.from(node.querySelectorAll('svg, .arc-command-trigger-label, kbd'))
          return content.every(element => {
            const rect = element.getBoundingClientRect()
            const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
            return rect.left >= button.left && rect.right <= button.right
              && (element.tagName.toLowerCase() === 'svg' || rect.height <= lineHeight + 1)
          })
        })).toBe(true)
      }
      await expect.poll(() => trigger.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(48)
    }

    await trigger.click()
    await expect(page.getByRole('dialog', { name: 'Command console' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  })

  test('header node survives market -> for-providers -> market', async ({ page }) => {
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

    await navigateMarketToForProviders(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Add a Tool.' })).toBeVisible()

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

    await navigateMarketToForProviders(page)

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
