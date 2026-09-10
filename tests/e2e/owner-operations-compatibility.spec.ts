import { expect, test } from '@playwright/test'

test.describe('owner Operations compatibility', () => {
  test('direct Operations entry keeps the signed-in shell during a source outage', async ({ page }) => {
    await page.goto('/owner/offerings')
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible()
    const navigationName = (page.viewportSize()?.width ?? 1440) < 768
      ? 'Owner primary navigation'
      : 'Operator navigation'
    await expect(page.getByRole('navigation', { name: navigationName })).toBeVisible()
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0)
  })

  test('legacy supplier and settings entrances replace into Operations', async ({ page }) => {
    for (const [source, hash] of [
      ['/owner/supply#earnings', '#earnings'],
      ['/owner/settings/workspace', '#supplier-identity'],
      ['/owner/settings/connections', '#supplier-connections'],
      ['/owner/settings/payouts', '#earnings'],
      ['/owner/status?slug=foreign-supplier', ''],
    ] as const) {
      await page.goto(source)
      await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')
      expect(new URL(page.url()).hash).toBe(hash)
      expect(new URL(page.url()).searchParams.has('slug')).toBe(false)
    }
  })

  test('retains only supported connection and payout callback intents', async ({ page }) => {
    await page.goto('/owner/supply?rebind=offering%3Aone#provider-connection-connection:one')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')
    let destination = new URL(page.url())
    expect(destination.pathname).toBe('/owner/offerings')
    expect(destination.searchParams.get('rebind')).toBe('offering:one')
    expect(destination.hash).toBe('#provider-connection-connection:one')

    await page.goto('/owner/supply?rebind=offering%3Aone&businessId=foreign&next=https%3A%2F%2Fevil.example#provider-connection-connection:one')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')
    destination = new URL(page.url())
    expect(destination.pathname).toBe('/owner/offerings')
    expect(destination.search).toBe('')
    expect(destination.hash).toBe('')

    for (const connect of ['return', 'refresh'] as const) {
      await page.goto(`/owner/supply?connect=${connect}`)
      await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')
      destination = new URL(page.url())
      expect(destination.pathname).toBe('/owner/offerings')
      expect(destination.searchParams.get('connect')).toBe(connect)
      expect(destination.hash).toBe('#earnings')
    }

    await page.goto('/owner/supply?connect=return&credential=private')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')
    destination = new URL(page.url())
    expect(destination.search).toBe('')
    expect(destination.hash).toBe('')
  })

  test('replace-history compatibility keeps the original Back destination', async ({ page }) => {
    await page.goto('/activity')
    await expect(page).toHaveURL(/\/activity$/)
    await page.goto('/owner/supply#earnings')
    await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/offerings')

    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/activity')
  })

  test('mobile primary navigation is Calls, Agents, Operations', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 768, 'compact navigation only')
    await page.goto('/owner/offerings')
    const nav = page.getByRole('navigation', { name: 'Owner primary navigation' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link').allTextContents()).resolves.toEqual(['Calls', 'Agents', 'Tools'])

    const callsLink = nav.getByRole('link', { name: 'Calls' })
    const activityRoutePreloaded = page.waitForResponse(
      (response) => response.url().includes('activity.tsx') && response.url().includes('tsr-split=component'),
      { timeout: 10_000 },
    ).catch(() => undefined)
    await callsLink.hover()
    await activityRoutePreloaded
    await callsLink.click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/activity')
    await expect(page.getByRole('heading', { level: 1, name: 'Calls', exact: true })).toBeVisible()
    await expect(page.getByRole('main')).toBeFocused()
  })

  test('compact Operations has no horizontal page overflow at 320px and 200% zoom', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 768, 'compact layout only')
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/owner/offerings')
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible()
    const overflows = await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(overflows).toBe(false)
  })
})
