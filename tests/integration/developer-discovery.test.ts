import { describe, expect, it } from 'vitest'

import { regenerateDiscoveryManifest } from '@/modules/discovery/public'
import {
  createFixtureDiscoverySourceState,
  testOnlyDiscoveryManifestAdapter,
} from '../helpers/discovery-fixture-source-state'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type {
  DeveloperDiscoveryExamplesArtifact,
  DeveloperDiscoverySchemaArtifact,
} from '@/modules/discovery/developer-discovery'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import { handleDeveloperDiscoveryExamplesRequest } from '@/routes/api.discovery.examples'
import { handleDeveloperDiscoverySchemaRequest } from '@/routes/api.discovery.schema'
import { loadDeveloperDiscoveryRoute } from '@/modules/discovery/developer-discovery-route'

const privateOrAuthorityPattern =
  /inquiryBody|ownerReply|claimantContact|ownerNotes|notificationPayload|providerPayload|adminEvidence|sourceHash|rawContact(?!Excluded)|private:evidence|ownerId|clerk|callable":true|paymentRequired":true|providerOperation":true|requestMarket":true|mutation":true|payment":true|protectedAction":true/iu


describe('developer discovery route handlers', () => {
  it('serves schema and examples with public headers and read-only payloads', async () => {
    const state = availableDiscoveryState()
    const request = new Request('https://ae.example/api/discovery/schema')
    const schemaResponse = await handleDeveloperDiscoverySchemaRequest(request, state, {
      now: 7_000,
      p2InquiryAvailability: {
        state: 'not_shipped',
        publicReason: 'Phase 2 public inquiry status is not shipped in this environment.',
        source: 'phase2-public-status-contract',
        lastVerifiedAt: 6_900,
      },
    })
    const examplesResponse = await handleDeveloperDiscoveryExamplesRequest(
      new Request('https://ae.example/api/discovery/examples'),
      state,
      { now: 7_000 }
    )
    const schema = (await schemaResponse.json()) as DeveloperDiscoverySchemaArtifact
    const examples = (await examplesResponse.json()) as DeveloperDiscoveryExamplesArtifact
    const serialized = JSON.stringify({ schema, examples })

    expect(schemaResponse.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=300')
    expect(schemaResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(schemaResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(schemaResponse.headers.get('X-AE-Discovery-Schema-Version')).toBe('developer-discovery:v1')
    expect(schemaResponse.headers.get('X-AE-Discovery-Cache-Version')).toBe('public-catalog-readonly-cache:v1')
    expect(schemaResponse.headers.get('X-AE-Discovery-Fetch-Status')).toBe('successful')
    expect(schemaResponse.headers.get('X-AE-Required-Funnel-Event')).toBe('schema_downloaded')

    expect(schema).toMatchObject({
      kind: 'public_catalog_schema',
      state: 'available',
      p2InquiryAvailability: {
        state: 'not_shipped',
        publicReason: 'Phase 2 public inquiry status is not shipped in this environment.',
        source: 'phase2-public-status-contract',
        lastVerifiedAt: 6_900,
      },
    })
    expect(examples).toMatchObject({
      kind: 'public_catalog_examples',
      state: 'available',
      examples: [expect.objectContaining({ slug: 'parramatta-emergency-plumbing' })],
    })
    expect(serialized).not.toMatch(privateOrAuthorityPattern)
  })

  it('keeps the page loader on the public readback contract', async () => {
    const readback = await loadDeveloperDiscoveryRoute()

    expect(readback).toMatchObject({
      schemaVersion: 'developer-discovery:v1',
      p2InquiryAvailability: {
        state: 'unavailable',
        source: 'phase2-public-status-contract',
      },
      publicationControls: {
        discoveryApiKeysEnabled: false,
      },
    })
    expect(Object.keys(readback.p2InquiryAvailability).sort()).toEqual(['lastVerifiedAt', 'publicReason', 'source', 'state'])
    expect(JSON.stringify(readback)).not.toMatch(privateOrAuthorityPattern)
  }, 15_000)

  it('derives discovery artifacts from explicit test source state', async () => {
    const state = availableDiscoveryState()
    const list = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const search = searchPublicBusinessOfferingSupply(state, {
      query: 'emergency plumber parramatta',
    })
    const firstListedBusiness = list.page.at(0)

    if (firstListedBusiness === undefined) {
      throw new Error('Expected the explicit test source state to return a business.')
    }

    const detail = getPublicBusinessOfferingSupplyBySlug(state, { slug: firstListedBusiness.slug })
    const schemaResponse = await handleDeveloperDiscoverySchemaRequest(
      new Request('https://ae.example/api/discovery/schema'),
      state,
      { now: 8_000 },
    )
    const examplesResponse = await handleDeveloperDiscoveryExamplesRequest(
      new Request('https://ae.example/api/discovery/examples'),
      state,
      { now: 8_000 },
    )
    const schema = (await schemaResponse.json()) as DeveloperDiscoverySchemaArtifact
    const examples = (await examplesResponse.json()) as DeveloperDiscoveryExamplesArtifact
    const serialized = JSON.stringify({ schema, examples })
    const expectedExampleSlugs = list.page
      .map((item) => item.slug)
      .sort((left, right) => left.localeCompare(right))

    expect(list).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
    })
    expect(search).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
    })
    expect(search.items.every((item) => list.page.some((listed) => listed.slug === item.slug))).toBe(true)
    expect(detail).toMatchObject({ kind: 'found', business: { slug: firstListedBusiness.slug } })
    expect(schema).toMatchObject({
      state: 'available',
      parityStatus: 'matched',
      pagination: { listRoutes: ['/api/businesses', '/api/businesses/search'] },
    })
    expect(examples.examples.map((item) => item.slug)).toEqual(expectedExampleSlugs)
    expect(serialized).not.toMatch(privateOrAuthorityPattern)
  })
})

function availableDiscoveryState(): DiscoverySourceState {
  const state = createFixtureDiscoverySourceState()
  const business = state.businesses.at(0)

  if (business === undefined) {
    throw new Error('Expected default discovery source state to include a business.')
  }

  const generated = regenerateDiscoveryManifest(
    state,
    { businessId: business.businessId },
    {
      canonicalBaseUrl: 'https://agentic.test',
      now: 3_000,
      adapter: testOnlyDiscoveryManifestAdapter,
    },
  )
  if (generated.kind !== 'ok') {
    throw new Error(`Expected discovery manifest generation to succeed: ${generated.reason}`)
  }

  return state
}
