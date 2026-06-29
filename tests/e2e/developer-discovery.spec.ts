import { expect, test, type Page } from '@playwright/test'

const futureAuthorityCopy =
  /book now|booking confirmed|pay now|payment required|protected action proposal|marketplace|request market|autonomous|agent handled|MCP tools available|OpenAPI action descriptor.*available|callable endpoint.*live|payment handler.*live|agent-callable/i
const privateFieldCopy =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|sourceHash|rawContact(?!Excluded)|private:evidence|ownerId|clerk/i

test.describe('developer discovery', () => {
  test('page renders read-only discovery contracts without future authority copy', async ({ page }) => {
    await page.goto('/developers/discovery')

    await expect(page.getByRole('heading', { name: /read-only public catalog files/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /download schema json/i })).toHaveAttribute('href', '/api/discovery/schema')
    await expect(page.getByRole('link', { name: /download examples json/i })).toHaveAttribute('href', '/api/discovery/examples')
    await expect(page.getByRole('link', { name: /download fixture bundle/i })).toHaveAttribute('href', '/api/discovery/fixtures')
    await expect(page.getByText(/phase 2 inquiry status/i)).toBeVisible()
    await expect(page.getByText(/gated exclusions/i)).toBeVisible()
    await expect(page.getByText(/API keys/i)).toBeVisible()
    await expect(page.getByText(/read path status/i)).toBeVisible()
    await expect(page.getByText(/HTTP/i).first()).toBeVisible()
    await expect(page.getByText(/schema/i).first()).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(futureAuthorityCopy)
    expect(bodyText).not.toMatch(privateFieldCopy)
    await expectNoHorizontalOverflow(page)
  })

  test('machine endpoints expose schema, examples, and fixtures with readback headers', async ({ request }) => {
    const listResponse = await request.get('/api/businesses')
    const schemaResponse = await request.get('/api/discovery/schema')
    const examplesResponse = await request.get('/api/discovery/examples')
    const fixturesResponse = await request.get('/api/discovery/fixtures')
    const list = listResponse.ok() ? await listResponse.json() : undefined
    const schema = await schemaResponse.json()
    const examples = await examplesResponse.json()
    const fixtures = await fixturesResponse.json()
    const serialized = JSON.stringify({ schema, examples, fixtures })

    expect(schemaResponse.ok()).toBe(true)
    expect(schemaResponse.headers()['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300')
    expect(schemaResponse.headers()['x-content-type-options']).toBe('nosniff')
    expect(schemaResponse.headers()['x-ae-discovery-schema-version']).toBe('developer-discovery:v1')
    expect(schemaResponse.headers()['x-ae-required-funnel-event']).toBe('schema_downloaded')

    expect(schema).toMatchObject({
      kind: 'public_catalog_schema',
      schemaVersion: 'developer-discovery:v1',
      nonAuthority: true,
    })
    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      schemaVersion: 'developer-discovery:v1',
      nonAuthority: true,
    })
    expect(fixtures).toMatchObject({
      kind: 'public_catalog_fixture_bundle',
      schemaVersion: 'developer-discovery:v1',
      gatedExclusions: expect.arrayContaining([expect.objectContaining({ surface: 'api_keys', state: 'unavailable' })]),
      routeHealth: expect.arrayContaining([expect.objectContaining({ route: expect.stringContaining('/api/businesses') })]),
    })
    if (list?.kind === 'ok' && list.items.length > 0) {
      const first = list.items[0]
      const searchResponse = await request.get(`/api/businesses/search?q=${encodeURIComponent(first.category)}`)
      const detailResponse = await request.get(`/api/businesses/${first.slug}`)
      const search = await searchResponse.json()
      const detail = await detailResponse.json()

      expect(searchResponse.ok()).toBe(true)
      expect(detailResponse.ok()).toBe(true)
      expect(search.items.map((item: { slug: string }) => item.slug)).toContain(first.slug)
      expect(detail).toMatchObject({ kind: 'found', business: { slug: first.slug, name: first.name } })
      expect(examples.examples).toEqual(
        expect.arrayContaining([expect.objectContaining({ slug: first.slug, name: first.name })])
      )
      expect(fixtures.routeHealth).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ route: expect.stringContaining('/api/businesses'), status: 'available' }),
          expect.objectContaining({ route: expect.stringContaining(`/api/businesses/${first.slug}`), status: 'available' }),
        ])
      )
    } else {
      expect(schema.state).toMatch(/degraded|unavailable/)
      expect(fixtures.routeHealth).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            route: expect.stringContaining('/api/businesses'),
            status: expect.stringMatching(/degraded|stale|unavailable/),
          }),
        ])
      )
    }
    expect(serialized).not.toMatch(/callable":true|paymentRequired":true|mutation":true|providerPayload|adminEvidence/i)
  })
})

async function expectNoHorizontalOverflow(page: Page) {
  const hasNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(hasNoOverflow).toBe(true)
}
