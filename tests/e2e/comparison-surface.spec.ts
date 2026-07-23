import { expect, test } from '@playwright/test'

import {
  canonicalSelectionCount,
  openComparisonFromRegistry,
} from './support/comparison'

test.describe('public Offering comparison', () => {
  test.setTimeout(60_000)

  test('keeps the decision first, exact selections durable, and causes no effect', async ({ page }) => {
    const nonQueryTransports: string[] = []
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (
        request.method() !== 'GET'
        && !/^\/api\/query(?:\/|$)/.test(pathname)
      ) {
        nonQueryTransports.push(`${request.method()} ${pathname}`)
      }
    })

    await openComparisonFromRegistry(page)

    const answer = page.getByRole('heading', { name: /not ranked|ordered by your priorities/i })
    const caveats = page.getByRole('region', { name: 'Important comparison notes' })
    const disclosure = page.locator('details').filter({ hasText: 'See full comparison' })
    await expect(answer).toBeVisible()
    await expect(caveats).toBeVisible()
    await expect(disclosure).not.toHaveAttribute('open', '')

    const answerBox = await answer.boundingBox()
    const caveatBox = await caveats.boundingBox()
    const disclosureBox = await disclosure.boundingBox()
    expect(answerBox?.y).toBeLessThan(caveatBox?.y ?? Number.POSITIVE_INFINITY)
    expect(caveatBox?.y).toBeLessThan(disclosureBox?.y ?? Number.POSITIVE_INFINITY)

    const summary = disclosure.getByText('See full comparison', { exact: true })
    await summary.focus()
    await summary.press('Enter')
    await expect(disclosure).toHaveAttribute('open', '')
    await expect(disclosure.getByText(/Published by the business · Observed/).first()).toBeVisible()
    await expect(disclosure.getByText(/Current when resolved|Out of date when resolved|still updating/).first()).toBeVisible()
    await expect(page.getByText('Local demo evidence', { exact: true })).toBeVisible()
    await expect(page.getByText(/do not prove live supply, provider availability, fulfilment, or customer value/i)).toBeVisible()

    const selectedUrl = page.url()
    expect(canonicalSelectionCount(new URL(selectedUrl))).toBe(2)
    expect(nonQueryTransports.filter((request) => (
      /\/api\/(?:mutation|action)(?:\/|$)/.test(request)
      || /(?:inquir|requests?|invocations?|payments?|endpoint|run|book|dispatch)/i.test(request)
    ))).toEqual([])
    await page.reload()
    await expect(page).toHaveURL(selectedUrl)
    await expect(page.getByText('2 of 4 selected').first()).toBeVisible()

    await page.goto('/registry?q=&limit=10')
    await page.goBack()
    await expect(page).toHaveURL(selectedUrl)
    await expect(page.getByText('2 of 4 selected').first()).toBeVisible()
    expect(nonQueryTransports.filter((request) => (
      request !== 'POST /api/observability/funnel'
    ))).toEqual([])
  })
})
