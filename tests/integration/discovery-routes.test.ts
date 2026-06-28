import { describe, expect, it } from 'vitest'

import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState, publishBusinessCatalog } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  buildLlmsTxt,
  buildSitemapXml,
  regenerateDiscoveryManifest,
  setPublicDiscoveryQueryClientForTests,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { handleUcpManifestRequest } from '@/routes/$slug.ucp'

describe('discovery route handlers', () => {
  it('serves a durable non-default UCP manifest with strict public fields', async () => {
    const state = createDurablePublishedDiscoveryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })

    await withDiscoveryQueryClient(state, async () => {
      const response = await handleUcpManifestRequest(
        new Request('https://ae.example/fremantle-heat-pump-repairs/ucp'),
        'fremantle-heat-pump-repairs'
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        schemaVersion: 'ae-ucp-fallback:v1',
        slug: 'fremantle-heat-pump-repairs',
        businessName: 'Fremantle Heat Pump Repairs',
        manifestUrl: 'https://ae.example/fremantle-heat-pump-repairs/ucp',
        pathKind: 'ae_hosted_fallback',
        status: 'available',
        unsupportedCapabilities: {
          callable: false,
          paymentRequired: false,
        },
        services: [
          {
            slug: 'heat-pump-diagnostics',
            status: 'published',
            capabilities: [
              {
                callable: false,
                paymentRequired: false,
              },
            ],
          },
        ],
      })
      expect(JSON.stringify(body)).not.toMatch(
        /parramatta-emergency-plumbing|rawContact|ownerId|clerk|private:evidence|admin|sourceRefs|callable":true|paymentRequired":true/
      )
    })
  })

  it('serves the AE-hosted UCP fallback manifest with route-safe headers', async () => {
    const response = await handleUcpManifestRequest(
      new Request('https://ae.example/parramatta-emergency-plumbing/ucp'),
      'parramatta-emergency-plumbing'
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(body).toMatchObject({
      schemaVersion: 'ae-ucp-fallback:v1',
      slug: 'parramatta-emergency-plumbing',
      manifestUrl: 'https://ae.example/parramatta-emergency-plumbing/ucp',
      pathKind: 'ae_hosted_fallback',
      status: 'available',
      unsupportedCapabilities: {
        callable: false,
        paymentRequired: false,
      },
      services: [
        {
          slug: 'emergency-pipe-repair',
          status: 'published',
          capabilities: [
            {
              callable: false,
              paymentRequired: false,
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(/rawContact|ownerId|clerk|private:evidence/)
  })

  it('returns an explicit not-found shape for absent or non-public slugs', async () => {
    const response = await handleUcpManifestRequest(
      new Request('https://ae.example/missing-business/ucp'),
      'missing-business'
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      kind: 'not_found',
      code: 'discovery_manifest_not_found',
      reason: 'No public discovery manifest exists for this slug.',
    })
  })
})

async function withDiscoveryQueryClient(state: DiscoverySourceState, run: () => Promise<void>): Promise<void> {
  const reset = setPublicDiscoveryQueryClientForTests({
    manifest: ({ slug, canonicalBaseUrl, now }) => {
      const result = regenerateDiscoveryManifest(state, { slug: brandNonEmpty(slug, 'Slug') }, {
        canonicalBaseUrl,
        now,
      })

      if (result.kind === 'ok') {
        return Promise.resolve({ kind: 'available', manifest: result.manifest })
      }

      return Promise.resolve({ kind: 'hidden', reason: 'not_public' })
    },
    llms: (options) => Promise.resolve(buildLlmsTxt(state, options)),
    sitemap: (options) => Promise.resolve(buildSitemapXml(state, options)),
  })

  try {
    await run()
  } finally {
    reset()
  }
}

function createDurablePublishedDiscoveryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
}): DiscoverySourceState {
  const state = emptyDiscoverySourceState()
  const claim = claimBusiness(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    facts: {
      name: input.businessName,
      category: 'Heat pump repair',
      suburb: input.suburb,
      stateTerritory: 'WA',
      requestedSlug: input.requestedSlug,
      ownerMessage: 'Owner supplied durable source facts.',
      sourceRefs: [
        {
          label: `${input.businessName} service card`,
          evidenceRef: `private:evidence:${input.requestedSlug}`,
          sourceHash: brandNonEmpty(`hash:source:${input.requestedSlug}`, 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
      rateLimit: {
        scope: 'claim_submit',
        key: `discovery:${input.requestedSlug}`,
        now: 10_000,
        limit: 5,
        windowMs: 60_000,
      },
    },
    operationKey: operationKey(`claim:${input.requestedSlug}`),
    correlationId: correlationId(`claim:${input.requestedSlug}`),
    now: 10_000,
  })

  if (claim.kind === 'error') {
    throw new Error(`Expected durable claim fixture to publish: ${claim.reason}`)
  }

  const publish = publishBusinessCatalog(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    claimId: claim.claim.claimId,
    services: [
      {
        name: input.serviceName,
        category: 'Heat pump repair',
        summary: `${input.serviceName} for ${input.suburb} homes.`,
        serviceArea: `${input.serviceQuery} and nearby suburbs`,
        hoursOrUnknown: 'Weekdays by appointment',
        firstRequest: {
          mode: 'not_available_yet',
          publicChannel: 'not_available',
          publicDisclosure: 'First request is not available yet.',
          noContactReason: 'Owner has not supplied public contact instructions.',
        },
      },
    ],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(`publish:${input.requestedSlug}`),
    correlationId: correlationId(`publish:${input.requestedSlug}`),
    now: 11_000,
  })

  if (publish.kind === 'error') {
    throw new Error(`Expected durable publish fixture to publish: ${publish.reason}`)
  }

  return state
}

function emptyDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
    discoveryManifests: [],
    invalidationIntents: [],
  }
}

function matchingCsrf(key: string) {
  return {
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    allowedOrigins: ['https://ae.example'],
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`op:discovery-route-test:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:discovery-route-test:${value}`, 'CorrelationId')
}
