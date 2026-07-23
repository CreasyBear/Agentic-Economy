import { expect, type Locator, type Page } from '@playwright/test'

export async function openComparisonFromRegistry(page: Page) {
  await page.goto('/registry?q=&limit=10')
  const offeringLinks = page.getByRole('link', { name: 'View Offering' })
  await expect.poll(() => offeringLinks.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  const offeringHrefs = (await offeringLinks.evaluateAll((links) => (
    links.map((link) => link.getAttribute('href')).filter((href): href is string => href !== null)
  )))
  const firstHref = offeringHrefs[0]
  const secondHref = offeringHrefs.find((href) => href !== firstHref)
  if (firstHref === undefined || secondHref === undefined) {
    throw new Error('Two distinct exact Offering links are required for the comparison loop.')
  }
  const firstOffering = page.locator(`a[href=${JSON.stringify(firstHref)}]`)
  await expect(firstOffering).toBeVisible()
  await firstOffering.click()
  await page.waitForLoadState('networkidle')
  const firstAdd = page.getByRole('button', { name: /^Add .+ to comparison$/i })
  await waitForReactClickHandler(firstAdd)
  await firstAdd.click()
  await page.waitForURL((url) => canonicalSelectionCount(url) === 1)
  await expect(page.getByText('1 of 4 selected').first()).toBeVisible()

  await page.getByRole('link', { name: 'Businesses', exact: true }).last().click()
  const returnedLinks = page.getByRole('link', { name: 'View Offering' })
  await expect.poll(() => returnedLinks.count()).toBeGreaterThanOrEqual(2)
  const secondIndex = await returnedLinks.evaluateAll((links, expectedPath) => (
    links.findIndex((link) => link.getAttribute('href')?.split('?')[0] === expectedPath)
  ), secondHref)
  if (secondIndex < 0) {
    throw new Error(`The distinct Offering link ${secondHref} was not preserved after returning to the registry.`)
  }
  const secondOffering = returnedLinks.nth(secondIndex)
  await expect(secondOffering).toBeVisible()
  await secondOffering.click()
  await page.waitForLoadState('networkidle')
  const secondAdd = page.getByRole('button', { name: /^Add .+ to comparison$/i })
  await waitForReactClickHandler(secondAdd)
  await secondAdd.click()
  await page.waitForURL((url) => canonicalSelectionCount(url) === 2)
  await expect(page.getByText('2 of 4 selected').first()).toBeVisible()

  const compare = page.getByRole('link', { name: 'Compare 2 Offerings' })
  await expect(compare).toBeVisible()
  await compare.click()
  await expect(page).toHaveURL(/\/compare\?.*selection=/)
  await expect(page.getByRole('heading', { name: 'Compare Offerings', level: 1 })).toBeVisible()
}

export function canonicalSelectionCount(url: URL): number {
  const encoded = url.searchParams.getAll('selection')
  if (encoded.length !== 1) return encoded.length
  try {
    const parsed: unknown = JSON.parse(encoded[0] ?? '')
    return Array.isArray(parsed) ? parsed.length : 1
  } catch {
    return 1
  }
}

async function waitForReactClickHandler(locator: Locator) {
  await expect.poll(async () => locator.evaluate((element) => (
    Object.keys(element).some((key) => {
      if (!key.startsWith('__reactProps$')) return false
      const props = (element as unknown as Record<string, unknown>)[key]
      return typeof props === 'object'
        && props !== null
        && typeof (props as { onClick?: unknown }).onClick === 'function'
    })
  ))).toBe(true)
}
