import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import {
  projectPublicServicesPage,
  type PublicBusinessCatalogApiV2Page,
  type ServiceOperationMap,
} from '@/modules/registry/public'
import type { OperationSearchWireResult } from '@/modules/capability-supply/public'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('curated provider operation registry', () => {
  it('seeds, discovers, and inspects the exact Exa to Frankfurter scenario with explicit authority', async () => {
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(await backend.mutation(internal.curatedProviders.retireLegacyExaV1, {})).toEqual([
      { publicationRef: 'offering:agentic-market-exa:search:v1', status: 'already_retired' },
      { publicationRef: 'offering:agentic-market-exa:contents:v1', status: 'already_retired' },
    ])

    for (const publication of seeded.publications) {
      const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
        publicationRef: publication.publicationRef,
        expectedRevision: 1,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 300_000,
        operationKey: `test:curated-readiness:${publication.publicationRef}`,
        correlationId: 'test:curated-provider-registry',
        reasonCode: 'test_live_readiness_projection',
        evidenceRefs: ['test:curated-provider-readiness'],
      })
      expect(observed).toMatchObject({ kind: 'observed' })
    }

    const exa: OperationSearchWireResult = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'Exa web research',
      limit: 10,
    })
    const frankfurter: OperationSearchWireResult = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'Frankfurter ECB reference rate',
      limit: 10,
    })
    expect(exa).toMatchObject({ kind: 'ok', matchedCount: 2 })
    expect(frankfurter).toMatchObject({ kind: 'ok', matchedCount: 1 })

    if (exa.kind !== 'ok' || frankfurter.kind !== 'ok') throw new Error('curated_operation_search_failed')
    expect(exa.items.map(({ contract }) => contract.capabilityId).sort()).toEqual(['exa.contents', 'exa.search'])
    expect(frankfurter.items.map(({ contract }) => contract.capabilityId)).toEqual(['frankfurter.single-rate'])

    const searchOperationRef = exa.items.find(({ contract }) => contract.capabilityId === 'exa.search')?.operationRef
    const contentsOperationRef = exa.items.find(({ contract }) => contract.capabilityId === 'exa.contents')?.operationRef
    const rateOperationRef = frankfurter.items.find(({ contract }) => contract.capabilityId === 'frankfurter.single-rate')?.operationRef
    if (searchOperationRef === undefined || contentsOperationRef === undefined || rateOperationRef === undefined) {
      throw new Error('curated_operation_ref_missing')
    }
    const operationRefs = [searchOperationRef, contentsOperationRef, rateOperationRef]

    const inspected = await backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs,
      mappingRefs: [seeded.mappingRef],
      expiresInMs: 300_000,
    })
    expect(inspected).toMatchObject({
      kind: 'ok',
      operationRefs,
      mappingRefs: [seeded.mappingRef],
      summary: {
        maximumCost: { kind: 'known', amount: { currency: 'USD', units: '2', exponent: 2 } },
        effects: expect.arrayContaining([
          expect.objectContaining({ class: 'data_release' }),
          expect.objectContaining({ class: 'financial_exposure' }),
        ]),
      },
    })
  })
  it('keeps the CoinGecko demo-key publication sandbox-only', async () => {
    const sandbox = convexTest(schema, modules)
    const sandboxSeed = await sandbox.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    expect(sandboxSeed.businessSlugs).toContain('coingecko-simple-price-demo')
    expect(sandboxSeed.publications.some(({ capabilityId }) => capabilityId === 'coingecko.simple-price-demo')).toBe(true)

    const sandboxCurrent = await sandbox.run(async (ctx) => (
      (await ctx.db.query('capabilityPublications').collect()).filter(({ disposition, publisherRef }) => (
        disposition === 'current' && publisherRef === 'system:curated-provider-bootstrap'
      ))
    ))
    expect(sandboxCurrent.some(({ capabilityId }) => capabilityId === 'coingecko.simple-price-demo')).toBe(true)

    const production = convexTest(schema, modules)
    const productionSeed = await production.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'production' })
    expect(productionSeed.businessSlugs).not.toContain('coingecko-simple-price-demo')
    expect(productionSeed.publications.some(({ capabilityId }) => capabilityId === 'coingecko.simple-price-demo')).toBe(false)

    const productionCurrent = await production.run(async (ctx) => (
      (await ctx.db.query('capabilityPublications').collect()).filter(({ disposition, publisherRef }) => (
        disposition === 'current' && publisherRef === 'system:curated-provider-bootstrap'
      ))
    ))
    expect(productionCurrent.some(({ capabilityId }) => capabilityId === 'coingecko.simple-price-demo')).toBe(false)
  })
  it('creates curated provider connections before publication and keeps reruns duplicate-safe', async () => {
    const backend = convexTest(schema, modules)
    const firstSeed = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    const firstState = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))
    const secondSeed = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    const secondState = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))

    expect(secondSeed.publications).toHaveLength(firstSeed.publications.length)
    expect(secondState.connections).toHaveLength(firstState.connections.length)
    expect(new Set(secondState.connections.map(({ connectionRef }) => connectionRef)).size)
      .toBe(secondState.connections.length)
    const connectionByRef = new Map(secondState.connections.map((connection) => [connection.connectionRef, connection]))
    const bindingById = new Map(secondState.bindings.map((binding) => [binding.bindingId, binding]))
    const currentPublications = secondState.publications.filter(({ disposition, publisherRef }) => (
      disposition === 'current' && publisherRef === 'system:curated-provider-bootstrap'
    ))
    expect(currentPublications.length).toBeGreaterThan(0)
    for (const publication of currentPublications) {
      const binding = bindingById.get(publication.bindingId)
      if (binding?.authority.kind !== 'provider_connection') continue
      const connection = connectionByRef.get(binding.authority.connectionRef)
      expect(connection).toBeDefined()
      expect(binding.connectionAuthority).toMatchObject({
        connectionRef: binding.authority.connectionRef,
        providerRef: binding.authority.providerRef,
        authorityGeneration: connection?.authorityGeneration,
        authorityDigest: connection?.authorityDigest,
      })
      expect(publication.connectionAuthority).toMatchObject({
        connectionRef: binding.authority.connectionRef,
        providerRef: binding.authority.providerRef,
        authorityGeneration: connection?.authorityGeneration,
        authorityDigest: connection?.authorityDigest,
      })
      expect(connection?.createdAt).toBeLessThanOrEqual(publication.createdAt)
    }
    const x402Connections = secondState.connections.filter(({ adapterId }) => adapterId === 'x402-fetch:v2')
    expect(x402Connections.length).toBeGreaterThan(0)
    expect(x402Connections.every(({ credentialRef }) => credentialRef === null)).toBe(true)
    expect(secondState.connections.filter(({ adapterId }) => adapterId === 'http-json:v1').map(({ credentialRef }) => credentialRef).sort()).toEqual([
      'env:COINGECKO_DEMO_API_KEY',
      'env:EXA_API_KEY',
      'env:OPENWEATHER_API_KEY',
      'env:SERPAPI_API_KEY',
      'env:TAVILY_API_KEY',
    ])
  })

  it('persists one exact access-path origin for every curated publication', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    const readback = await backend.run(async (ctx) => {
      const publications = await ctx.db.query('capabilityPublications').collect()
      const rows = []
      for (const publication of publications) {
        if (publication.publisherRef !== 'system:curated-provider-bootstrap') continue
        const offering = await ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
          .unique()
        const binding = await ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
          .unique()
        const origin = offering?.origin
        const accessPathRef = origin?.kind === 'catalog_offering'
          ? origin.declaredAccessPathRef
          : undefined
        const path = accessPathRef === undefined
          ? null
          : await ctx.db.query('offeringAccessPaths')
            .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
            .unique()
        rows.push({
          publicationRef: publication.publicationRef,
          origin,
          path: path === null
            ? null
            : {
                accessPathRef: path.accessPathRef,
                offeringRef: path.offeringRef,
                offeringRevision: path.offeringRevision,
                offeringSourceHash: path.offeringSourceHash,
                sourceHash: path.sourceHash,
                descriptor: path.descriptor,
              },
          bindingEndpointUrl: binding?.endpointUrl,
        })
      }
      return rows
    })

    expect(readback).toHaveLength(20)
    expect(new Set(readback.map(({ path }) => path?.accessPathRef)).size).toBe(20)
    for (const row of readback) {
      expect(row.path).not.toBeNull()
      expect(row.origin).toMatchObject({
        kind: 'catalog_offering',
        offeringRef: row.path?.offeringRef,
        offeringRevision: row.path?.offeringRevision,
        offeringSourceHash: row.path?.offeringSourceHash,
        declaredAccessPathRef: row.path?.accessPathRef,
        accessPathSourceHash: row.path?.sourceHash,
      })
      expect(row.path?.descriptor).toMatchObject({
        kind: 'external_operation',
        url: row.bindingEndpointUrl,
      })
    }
  })

  it('wires the W1 origin seam: a seed business catalog offering enriches Service.endpoints[] and sub-cent pricing stays a catalog representation', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    const page: PublicBusinessCatalogApiV2Page = await backend.query(api.registry.listPublicBusinessOfferingSupply, {
      paginationOpts: { cursor: null, numItems: 100 },
    })
    expect(page).toMatchObject({ kind: 'ok' })
    if (page.kind !== 'ok') throw new Error('curated_registry_page_failed')

    const businessIds = page.page.map((business) => business.businessId)
    const map = await backend.query(api.capabilitySupplyOperations.offeringOperationMap, { businessIds })
    const operationMap: Record<string, ServiceOperationMap[string]> = {}
    for (const entry of map) {
      const existing = operationMap[entry.offeringRef] ?? []
      operationMap[entry.offeringRef] = [...existing, entry]
    }

    const services = projectPublicServicesPage(page, operationMap)

    const frankfurter = services.services.find((service) => service.id === 'frankfurter-ecb-rates')
    expect(frankfurter).toBeDefined()
    // The Frankfurter catalog offering carries an external_operation access path
    // AND its capability offering carries origin linking it to that offering, so
    // the W1 seam enriches the endpoint (no fabrication).
    expect(frankfurter!.endpoints).toHaveLength(1)
    expect(frankfurter!.endpoints[0]).toMatchObject({
      method: 'GET',
      ae: {
        operationRef: expect.stringMatching(/^operation:v1:[0-9a-f]{64}$/),
      },
      pricing: { scheme: 'exact', currency: 'USD' },
    })
    expect(frankfurter!.endpoints[0]!.parameters).toMatchObject([
      { group: 'query', name: 'base', type: 'string', required: true },
      { group: 'query', name: 'quote', type: 'string', required: true },
    ])
    expect(frankfurter!.endpoints[0]).not.toHaveProperty('catalogPrice')

    // agentic-market-exa has TWO curated operations on ONE catalog offering.
    // Each operation owns a distinct declared access path, so both endpoints
    // enrich independently instead of falling back to offering-level ambiguity.
    const exa = services.services.find((service) => service.id === 'agentic-market-exa')
    expect(exa).toBeDefined()
    expect(exa!.endpoints).toHaveLength(2)
    const exaEndpoints = exa!.endpoints.filter(({ ae }) => ae.operationRef !== undefined)
    expect(exaEndpoints).toHaveLength(2)
    expect(new Set(exaEndpoints.map(({ ae }) => ae.operationRef)).size).toBe(2)
    const exaSearchEndpoint = exaEndpoints.find(({ parameters }) => parameters.some(({ name }) => name === 'query'))
    const exaContentsEndpoint = exaEndpoints.find(({ parameters }) => parameters.some(({ name }) => name === 'urls'))
    expect(exaSearchEndpoint).toBeDefined()
    expect(exaContentsEndpoint).toBeDefined()
    expect(exaSearchEndpoint!.parameters).toEqual([
      { group: 'body', name: 'numResults', type: 'integer', description: 'The maximum number of Exa results to return.', default: 10, required: false },
      { group: 'body', name: 'query', type: 'string', description: 'The web search query.', required: true },
      { group: 'body', name: 'type', type: 'string', description: 'The Exa search mode.', enumValues: ['auto', 'instant', 'fast', 'deep-lite', 'deep', 'deep-reasoning'], default: 'auto', required: false },
    ])
    expect(exaContentsEndpoint!.parameters).toEqual([
      { group: 'body', name: 'text', type: 'boolean', description: 'Whether to return extracted page text.', default: true, required: false },
      { group: 'body', name: 'urls', type: 'array', description: 'URLs selected from a preceding Exa search result.', required: true },
    ])

    // Sub-cent: the observed x402 listing retains its decimal catalog
    // representation, while the integer-minor ledger is untouched (checked
    // below against the persisted offering price).
    const exaX402 = services.services.find((service) => service.id === 'agentic-market-exa-x402')
    expect(exaX402).toBeDefined()
    const subCentEndpoint = exaX402!.endpoints.find((endpoint) => endpoint.ae.operationRef !== undefined)
    expect(subCentEndpoint).toBeDefined()
    expect(subCentEndpoint!.pricing).toMatchObject({
      scheme: 'exact',
      amount: '0.007',
      currency: 'USD',
    })
    expect(subCentEndpoint!.pricing).toMatchObject({ network: 'eip155:8453' })
    // The observed Cluster C source is x402 and carries a payment transport, but
    // remains catalog-only until readiness and release authority are admitted.
    expect(exaX402!.networks).toEqual(['eip155:8453'])

    // The persisted catalog offering retains the observed sub-cent exact amount;
    // it is not rounded into a two-decimal settlement basis.
    const persisted = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', 'offering:agentic-market-exa-x402:search:v1'))
        .unique()
    )?.presentation.price)
    expect(persisted).toEqual({ kind: 'fixed', amount: { currency: 'USD', units: '7', exponent: 3 } })
  })
  it('keeps curated access paths distinct and idempotent across repeated seeds', async () => {
    const backend = convexTest(schema, modules)
    const first = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })
    const second = await backend.mutation(internal.curatedProviders.seed, { runtimeEnvironment: 'sandbox' })

    expect(second.publications).toHaveLength(first.publications.length)
    const exaPaths = await backend.run(async (ctx) => {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', 'agentic-market-exa'))
        .unique()
      if (business === null) throw new Error('curated_idempotency_business_missing')
      const offering = await ctx.db.query('businessOfferings')
        .withIndex('by_businessId_and_status', (query) => (
          query.eq('businessId', business._id).eq('status', 'published')
        ))
        .unique()
      if (offering === null) throw new Error('curated_idempotency_offering_missing')
      return await ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => (
          query.eq('offeringRef', offering.offeringRef).eq('status', 'published')
        ))
        .collect()
    })
    expect(exaPaths).toHaveLength(2)
    expect(new Set(exaPaths.map(({ accessPathRef }) => accessPathRef)).size).toBe(2)
    expect(new Set(exaPaths.map(({ sourceHash }) => sourceHash)).size).toBe(2)
  })

})
