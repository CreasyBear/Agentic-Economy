import { describe, expect, it } from 'vitest'

import {
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
  DiscoveryPublicSurfacePaths,
} from '@/modules/discovery/internal/discovery-files'
import { PublicBusinessCatalogApiSchemaVersion } from '@/modules/registry/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

const canonicalBaseUrl = 'https://ae.example'

describe('Tool-first llms.txt index', () => {
  it('teaches one canonical market loop and stays compact', () => {
    const result = buildOfferingLlmsTxt(catalogOf(50), { canonicalBaseUrl })
    const markers = [
      '1. Search by outcome:',
      '2. Describe one exact result:',
      '3. Call `tool.quote`',
      '4. Call only with the returned Quote',
      '5. Keep the receipt:',
      'Canonical catalogue:',
    ]

    let previous = -1
    for (const marker of markers) {
      const current = result.body.indexOf(marker)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }

    expect(result.body).toContain(`POST ${canonicalBaseUrl}/api/v1/market-tools/search`)
    expect(result.body).toContain(`POST ${canonicalBaseUrl}/api/v1/market-tools/describe`)
    expect(result.body).toContain(`${canonicalBaseUrl}/market`)
    expect(result.body).not.toMatch(/Published businesses|\/api\/businesses|registry\.search|registry\.detail/u)
    expect(new TextEncoder().encode(result.body).length).toBeLessThan(4096)
  })

  it('keeps human provider pages in URL inventory without advertising legacy machine APIs', () => {
    const urls = buildOfferingLlmsUrlsFromSlugs(['same-business', 'same-business'], { canonicalBaseUrl })

    expect(urls).toEqual([...new Set(urls)])
    expect(urls).toContain(`${canonicalBaseUrl}/same-business`)
    expect(urls).not.toContain(`${canonicalBaseUrl}/same-business/ucp`)
    expect(urls.some((url) => url.includes('/api/businesses'))).toBe(false)
    expect(urls).toHaveLength(DiscoveryPublicSurfacePaths.length + 1)
  })

  it('makes anonymous and authenticated boundaries explicit', () => {
    const body = buildOfferingLlmsTxt([], { canonicalBaseUrl }).body

    expect(body).toContain('Public: list, search, describe, and compare.')
    expect(body).toContain('Connect only when tool.quote returns the OAuth challenge.')
    expect(body).toContain('The AE key identifies the caller.')
    expect(body).toContain('Never infer fulfilment, payment, deployment, or a receipt')
    expect(body).toContain('Boundary:')
    expect(body).toContain(`- ${canonicalBaseUrl}/privacy/remove-business`)
  })
})

function catalogOf(count: number): readonly PublicBusinessCatalogApiV2Dto[] {
  return Array.from({ length: count }, (_unused, index): PublicBusinessCatalogApiV2Dto => ({
    schemaVersion: PublicBusinessCatalogApiSchemaVersion,
    businessId: `business:${index}`,
    slug: `provider-${index}`,
    name: `Provider ${index}`,
    category: 'Tools',
    businessContext: {
      kind: 'programmable_provider',
      website: `https://provider-${index}.example`,
      providerIdentifier: `provider-${index}`,
    },
    publicUrl: `/provider-${index}`,
    trustTier: 'listed',
    photos: [],
    observedAt: 100,
    disposition: 'current',
    offerings: [],
    accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
  }))
}
