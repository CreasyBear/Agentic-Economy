import { expect, test } from '@playwright/test'

test.describe('application recovery', () => {
  test('market context survives detail navigation, history, and refresh', async ({ page }) => {
    const firstRef = `operation:v1:${'a'.repeat(64)}`
    const secondRef = `operation:v1:${'b'.repeat(64)}`
    const comparison = `${firstRef},${secondRef}`
    const returnContext = new URL('/market', 'http://ae.local')
    returnContext.searchParams.set('query', 'weather alerts')
    returnContext.searchParams.set('availability', 'routeable')
    returnContext.searchParams.set('category', 'data-research')
    returnContext.searchParams.set('compare', comparison)
    returnContext.hash = 'tools'
    const expectedContext = `${returnContext.pathname}${returnContext.search}${returnContext.hash}`

    await page.goto(
      `/tools/${encodeURIComponent(firstRef)}?from=${encodeURIComponent(expectedContext)}`,
    )
    const back = page.getByRole('link', { name: 'Back to comparison' })
    await expect(back).toBeVisible()
    await expect(async () => {
      await back.click()
      await expect.poll(() => marketContext(page.url()), { timeout: 1_000 }).toEqual({
        pathname: '/market',
        query: 'weather alerts',
        availability: 'routeable',
        category: 'data-research',
        compare: comparison,
        hash: '#tools',
      })
    }).toPass()

    await page.goBack()
    await expect(page).toHaveURL(/\/tools\/operation%3Av1%3A|\/tools\/operation:v1:/)
    await expect(page.getByRole('link', { name: 'Back to comparison' })).toBeVisible()

    await page.goForward()
    await expect.poll(() => marketContext(page.url())).toEqual({
      pathname: '/market',
      query: 'weather alerts',
      availability: 'routeable',
      category: 'data-research',
      compare: comparison,
      hash: '#tools',
    })

    await page.reload()
    await expect.poll(() => marketContext(page.url())).toEqual({
      pathname: '/market',
      query: 'weather alerts',
      availability: 'routeable',
      category: 'data-research',
      compare: comparison,
      hash: '#tools',
    })
  })
})

function marketContext(value: string) {
  const url = new URL(value)
  return {
    pathname: url.pathname,
    query: url.searchParams.get('query'),
    availability: url.searchParams.get('availability'),
    category: url.searchParams.get('category'),
    compare: url.searchParams.get('compare'),
    hash: url.hash,
  }
}
