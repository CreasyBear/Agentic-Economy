import { describe, expect, it } from 'vitest'

import {
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
} from '@/modules/discovery/internal/discovery-files'
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

    expect(result.body).toContain('- total=50; the lines above are a bounded sample')
    expect(result.body).toContain(`- full list=${canonicalBaseUrl}/api/businesses`)
    expect(result.body).not.toContain('fremantle-heat-pump-repairs-42')

    // Bounding the body must not bound what the index advertises as resolvable.
    for (const business of businesses) {
      expect(result.urls).toContain(`${canonicalBaseUrl}/${business.slug}`)
      expect(result.urls).toContain(`${canonicalBaseUrl}/${business.slug}/ucp`)
      expect(result.urls).toContain(`${canonicalBaseUrl}/api/businesses/${business.slug}`)
    }
    // 10 shared surfaces; each business keeps page, UCP, and business detail.
    expect(result.urls).not.toContain(`${canonicalBaseUrl}/registry`)
    expect(result.urls).toHaveLength(10 + 50 * 3)
  })

  it('deduplicates repeated slugs in the complete URL inventory', () => {
    const urls = buildOfferingLlmsUrlsFromSlugs(['same-business', 'same-business'], { canonicalBaseUrl })

    expect(urls).toEqual([...new Set(urls)])
    expect(urls).toHaveLength(10 + 3)
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

  it('teaches the ordered Operation path before the secondary business directory', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body
    const markers = [
      '1. No-install Step 1:',
      '2. Search a job anonymously',
      '3. Inspect one exact result',
      '4. Optional anonymous reads',
      '5. Run `npm run -s ae -- connect --json`',
      '6. Invoke with `npm run -s ae -- invoke',
      '7. Read `npm run -s ae -- status',
      '8. Cancel with `npm run -s ae -- advanced cancel',
      '9. Reconcile uncertain work with `npm run -s ae -- recover',
      'Published businesses (secondary directory):',
    ]
    let previous = -1
    for (const marker of markers) {
      const current = body.indexOf(marker)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
    expect(body).toContain(`POST ${canonicalBaseUrl}/api/v1/market-operations/search`)
    expect(body).toContain(`POST ${canonicalBaseUrl}/api/v1/market-operations/detail`)
    expect(body).toContain('npm run -s ae -- recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json')
  })

  it('makes anonymous and authenticated boundaries explicit', () => {
    const body = buildOfferingLlmsTxt(catalogOf(1, () => 'only-business'), { canonicalBaseUrl }).body

    expect(body).toContain('Anonymous: search, detail, compare, inspect-plan. Authenticated: invoke, status, cancel, reconcile.')
    expect(body).toContain('The AE key identifies the caller.')
    expect(body).toContain('never contains provider credentials or silently grants payment or consequential authority')
    expect(body).toContain('Never infer fulfilment, payment, deployment, or a receipt')
    expect(body).not.toMatch(/\bae (?:feeds|run|study)\b|Services API|Customer Request API|\/api\/answer\/turn/u)
  })

  it('keeps the exact business total separate from the bounded DTO sample', () => {
    const result = buildOfferingLlmsTxt(catalogOf(12, (index) => `business-${index}`), {
      canonicalBaseUrl,
      totalBusinesses: 50,
    })

    expect(result.body).toContain('- total=50; the lines above are a bounded sample')
    expect(buildOfferingLlmsUrlsFromSlugs(
      Array.from({ length: 50 }, (_unused, index) => `business-${index}`),
      { canonicalBaseUrl },
    )).toHaveLength(10 + 50 * 3)
  })

  it('keeps the boundary and correction sections and says none for an empty directory', () => {
    const body = buildOfferingLlmsTxt([], { canonicalBaseUrl }).body

    expect(body).toContain('Published businesses (secondary directory):\n- none')
    expect(body).toContain('- total=0;')
    expect(body).toContain('Boundary:')
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
    businessContext: { kind: 'local_human', suburb: 'Fremantle', stateTerritory: 'WA' },
    publicUrl: `/${slug(index)}`,
    trustTier: 'listed',
    photos: [],
    observedAt: 100,
    disposition: 'current',
    offerings: [],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }))
}
