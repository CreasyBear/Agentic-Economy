import { describe, expect, it } from 'vitest'

import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '@/modules/customer-request/public-comprehension'
import { buildOfferingLlmsTxt } from '@/modules/discovery/internal/discovery-files'
import { PublicBusinessCatalogApiSchemaVersion } from '@/modules/registry/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const canonicalBaseUrl = 'https://ae.example'

/**
 * `/llms.txt` is read by agents that truncate long documents. A catalog-sized
 * index loses its own entry contract before the reader reaches it, so the body
 * is bounded by both an entry count and a byte ceiling, while `urls` stays
 * complete for sitemap and route-parity consumers.
 */
describe('Offering llms.txt index', () => {
  /** 30 characters is a representative Australian business slug, so the full
   * 12-entry sample has to survive the ceiling at that length, not just for
   * short fixture slugs. */
  it('fits the whole 12-entry sample under the byte ceiling with realistic slugs', () => {
    const businesses = catalogOf(50, (index) => `fremantle-heat-pump-repairs-${String(index).padStart(2, '0')}`)
    expect(businesses[0]?.slug).toHaveLength(30)

    const result = buildOfferingLlmsTxt(businesses, { canonicalBaseUrl })

    expect(result.body.split('\n').filter((line) => line.startsWith('- slug='))).toHaveLength(12)
    expect(new TextEncoder().encode(result.body).length).toBeLessThan(4096)

    expect(result.body).toContain('- total=50; the lines above are a sample, not the catalog')
    expect(result.body).toContain(
      `- full list=${canonicalBaseUrl}/api/businesses search=${canonicalBaseUrl}/api/businesses/search?q=`
    )
    expect(result.body).not.toContain('fremantle-heat-pump-repairs-42')

    // Bounding the body must not bound what the index advertises as resolvable.
    for (const business of businesses) {
      expect(result.urls).toContain(`${canonicalBaseUrl}/${business.slug}`)
      expect(result.urls).toContain(`${canonicalBaseUrl}/${business.slug}/ucp`)
      expect(result.urls).toContain(`${canonicalBaseUrl}/api/businesses/${business.slug}`)
    }
    expect(result.urls).toHaveLength(10 + 50 * 3)
  })

  /** Pathological slugs, not just large catalogs, are what push an index past a
   * reader. The ceiling clamps the sample rather than letting the body grow. */
  it('holds the byte ceiling for pathological slugs and still names at least one entry', () => {
    const result = buildOfferingLlmsTxt(
      catalogOf(50, (index) => `fremantle-heat-pump-and-hydronic-emergency-repairs-and-servicing-${index}`),
      { canonicalBaseUrl }
    )

    const lines = result.body.split('\n').filter((line) => line.startsWith('- slug='))
    expect(new TextEncoder().encode(result.body).length).toBeLessThan(4096)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(12)
    expect(result.body).toContain('- total=50;')
    expect(result.urls).toHaveLength(10 + 50 * 3)
  })

  /** The index points at the full procedure rather than restating it. */
  it('delegates the request recipe to SKILL.md and keeps the journey framing to three statements', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body
    const section = (name: string) =>
      body.slice(body.indexOf(`${name}\n`) + name.length + 1).split('\n\n')[0]?.split('\n') ?? []

    expect(section('Request recipe:')).toEqual([
      `- ${canonicalBaseUrl}/SKILL.md carries the full procedure: relation-following, stop rules, and confirmation.`,
    ])
    expect(section('Customer journey:')).toEqual([
      `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[0]}`,
      `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[1]}`,
      `- ${CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES[3]}`,
      `- Human entry=${canonicalBaseUrl}/`,
    ])
    // The sandbox qualifier must survive the trim: it is what keeps
    // "carries the work through" from reading as a fulfilment claim.
    expect(body).toContain('do not prove independent supply, booking, payment, dispatch, or fulfilment')
  })

  it('publishes the keyless Services API with honest sandbox boundaries', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body
    const servicesSection = body.slice(body.indexOf('## Services API'), body.indexOf('Assistant setup:'))

    expect(servicesSection).toContain('GET /api/v1/services')
    expect(servicesSection).toContain('GET /api/v1/services/search?q={query}')
    expect(servicesSection).toContain('`summary`, `pricingSummary`, `price`')
    expect(servicesSection).toContain('ONE PAGE')
    expect(servicesSection).toContain('pagination.nextCursor')
    expect(servicesSection).toContain('pagination.hasMore')
    expect(servicesSection).toContain('business_declared')
    expect(servicesSection).toContain('publicly_observed')
    expect(servicesSection).toContain('quote response carries provenance `ae_sandbox_provider`')
    expect(servicesSection).toContain('open sandbox')
    expect(servicesSection).toContain('POST /api/sandbox/adelaide-dental-clinic/checkup-quote')
    expect(servicesSection).toContain('priced, time-bounded quote JSON')
    expect(servicesSection).not.toContain('description')
    expect(servicesSection).not.toMatch(/payment|x402|booked/iu)
  })


  it('leads with the keyless entry before the key-gated Customer Request path', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body

    expect(body).toContain(`- POST ${canonicalBaseUrl}/api/answer/turn`)
    expect(body).toContain('no key and no credential are required')
    expect(body).toContain(`- MCP: ${canonicalBaseUrl}/mcp`)
    expect(body).toContain('- response=text/event-stream')
    expect(body).toContain(ANSWER_THREAD_AGENT_ENTRYPOINT.boundary)
    expect(body).toContain('"query"')
    expect(body.indexOf('Start here (no key needed):')).toBeLessThan(body.indexOf('Customer Request API:'))
  })

  it('names where the Customer Request key comes from and when to escalate to it', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body

    expect(body).toContain(
      `- auth=Bearer AE API key with customer_requests:create, issued to a signed-in account at ${canonicalBaseUrl}/agent-access`
    )
    expect(body).toContain('- escalate=take this path only when the customer wants to confirm and start an option')
  })

  it('keeps the boundary and correction sections and says none for an empty catalog', () => {
    const body = buildOfferingLlmsTxt([], { canonicalBaseUrl }).body

    expect(body).toContain('Business entries:\n- none')
    expect(body).toContain('- total=0;')
    expect(body).toContain('Listing boundary:')
    expect(body).toContain('Privacy and correction:')
    expect(body).toContain(`- ${canonicalBaseUrl}/privacy/remove-business`)
  })
})

function catalogOf(count: number, slug: (index: number) => string): readonly PublicBusinessCatalogApiV2Dto[] {
  return Array.from({ length: count }, (_unused, index): PublicBusinessCatalogApiV2Dto => ({
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
    businessId: `business:${index}`,
    slug: slug(index),
    name: `Fremantle Heat Pump Repairs ${index}`,
    category: 'Trades',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publicUrl: `/${slug(index)}`,
    trustTier: 'listed',
    photos: [],
    observedAt: 100,
    disposition: 'current',
    offerings: [],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }))
}
