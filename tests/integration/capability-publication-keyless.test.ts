import { describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import {
  isPublicOperationRef,
  parseHttpJsonTransportConfiguration,
  type OperationSearchWireResult,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  operationContext,
  ownerMaintenanceArgs,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'

describe('capability publication keyless', () => {
  it('finds a novel keyless GET after more than 1024 prior publications, executes it, and withdraws it fail closed', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'xyz-current-price',
    )
    await seedCatalogOffering(
      backend,
      businessId,
      'xyz-current-price',
      '/price',
      'GET',
    )
    await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await backend.run(async (ctx) => {
      for (let index = 0; index < 1025; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          publicationRef: `filler-publication:${index}`,
          operationRef: `filler-operation:${index}`,
          revision: 1,
          businessId,
          networkId: 'ae:public',
          runtimeEnvironment: 'sandbox',
          capabilityId: 'filler.capability',
          version: 1,
          contractDigest: `filler-contract:${index}`,
          sourceKind: 'ae_envelope',
          sourceRevision: `filler-source-revision:${index}`,
          sourceDigest: `filler-source:${index}`,
          publisherRef: 'filler-publisher',
          authorityMode: 'provider_owned',
          provenanceDigest: `filler-provenance:${index}`,
          offeringId: `filler-offering:${index}`,
          bindingId: `filler-binding:${index}`,
          disposition: 'withdrawn',
          credentialState: 'unobserved',
          healthState: 'unobserved',
          readinessEvidenceRefs: [],
          registrationEvidenceRefs: [],
          createdAt: index,
          updatedAt: index,
          withdrawnAt: index,
        })
      }
    })

    const source: KeylessExecutableSourcePort = {
      list: async () => {
        const rows = await backend.query(
          api.capabilitySupplyOperations.listKeylessExecutable,
          {},
        )
        return rows
          .filter((row: (typeof rows)[number]) =>
            isPublicOperationRef(row.operationRef),
          )
          .map(
            ({
              inputSchemaJson,
              inputExamplesJson,
              ...row
            }: (typeof rows)[number]): KeylessExecutableToolDescriptor => {
              const descriptor: KeylessExecutableToolDescriptor = {
                ...row,
                inputSchema: JSON.parse(inputSchemaJson) as Record<
                  string,
                  unknown
                >,
              }
              if (inputExamplesJson === undefined) return descriptor
              return {
                ...descriptor,
                inputExamples: JSON.parse(inputExamplesJson) as NonNullable<
                  KeylessExecutableToolDescriptor['inputExamples']
                >,
              }
            },
          )
      },
      read: async (operationRef) => {
        if (!isPublicOperationRef(operationRef)) return null
        const snapshot = await backend.query(
          internal.capabilitySupplyOperations
            .readCurrentPublishedOperationSnapshot,
          { operationRef },
        )
        if (snapshot === null) return null
        try {
          const operation = JSON.parse(
            snapshot.operationJson,
          ) as PublishedOperation
          const transport = parseHttpJsonTransportConfiguration(
            JSON.parse(operation.transport.configJson),
          )
          if (
            operation.kind !== 'published_operation' ||
            operation.binding.authority.kind !== 'keyless' ||
            operation.binding.adapter.adapterId !== 'http-json:v1' ||
            operation.identity.payment.kind !== 'none' ||
            transport === undefined ||
            transport.method !== 'GET'
          ) {
            return null
          }
          return {
            operationRef,
            capabilityId: operation.contract.ref.capabilityId,
            name: operation.offering.presentation.label,
            endpointUrl: operation.binding.endpointUrl,
            authority: { kind: 'keyless' as const },
            adapterId: operation.binding.adapter.adapterId,
            method: transport.method,
            price: operation.offering.presentation.price,
            effects: operation.contract.effects,
            ...(transport.query === undefined || transport.query.length === 0
              ? {}
              : { query: [...transport.query] }),
            ...(transport.fixedQuery === undefined ||
            transport.fixedQuery.length === 0
              ? {}
              : { fixedQuery: [...transport.fixedQuery] }),
            requestTimeoutMs: transport.requestTimeoutMs,
            inputSchema: operation.contract.inputSchema,
            outputSchema: operation.contract.outputSchema,
            provenance: { publisher: 'ae-internal', sourceKind: 'internal' },
          }
        } catch {
          return null
        }
      },
      search: async (query, descriptors) => {
        if (descriptors.length === 0 || query.trim().length === 0) return []
        const allowed = new Set(
          descriptors.map(({ operationRef }) => operationRef),
        )
        const result: OperationSearchWireResult = await backend.query(
          api.capabilitySupplyOperations.search,
          { query, limit: 10 },
        )
        if (result.kind !== 'ok') return []
        return result.items
          .map(({ operationRef }) => operationRef)
          .filter(
            (operationRef) =>
              isPublicOperationRef(operationRef) && allowed.has(operationRef),
          )
      },
    }

    const input = {
      businessId,
      source: {
        kind: 'ae_envelope' as const,
        documentJson: JSON.stringify(
          capabilityContractV2({
            capabilityId: 'xyz.current-price',
            name: 'XYZ current price',
            description: 'Return the current public price for the XYZ token.',
            inputExamples: [
              { label: 'XYZ current price', input: { request: 'XYZ' } },
            ],
          }),
        ),
      },
      offering: {
        offeringId: 'offering:xyz-current-price',
        networkId: 'ae:public',
        presentation: {
          label: 'XYZ current price',
          summary: 'Returns the current public price for the XYZ token.',
          price: {
            kind: 'fixed' as const,
            amount: { currency: 'AUD', units: '0', exponent: 2 },
          },
          materialTerms: [],
          commercialRelationship: {
            kind: 'none' as const,
            summary: 'No commercial influence.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['business:xyz-neutrality'],
          },
        },
        searchTerms: ['xyz', 'current', 'price', 'token'],
        registrationEvidenceRefs: ['business:xyz-publication'],
      },
      binding: {
        bindingId: 'binding:xyz-current-price:http',
        endpointUrl: 'https://xyz-current-price.example.test/price',
        authority: { kind: 'keyless' as const },
        continuation: {
          kind: 'single_response' as const,
          evidenceRefs: ['business:xyz-response'],
        },
        cancellation: {
          kind: 'unsupported' as const,
          evidenceRefs: ['business:xyz-no-cancellation'],
        },
        adapter: {
          adapterId: 'http-json:v1',
          config: {
            method: 'GET' as const,
            query: [{ inputPointer: '/request', parameter: 'symbol' }],
            requestTimeoutMs: 5_000,
          },
        },
        registrationEvidenceRefs: ['business:xyz-http-binding'],
      },
      ...operationContext('publish-xyz-current-price'),
    }
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    await admitPublication(backend, published, 'xyz-current-price')
    const observed = await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 300_000,
        ...operationContext('observe-xyz-current-price'),
      },
    )
    expect(observed).toMatchObject({ kind: 'observed' })
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      lifecycle: { state: 'active', reasons: [] },
    })
    const discovered = await backend.query(
      api.capabilitySupplyOperations.search,
      {
        query: 'xyz current price',
        limit: 10,
      },
    )
    expect(discovered.kind).toBe('ok')
    if (discovered.kind !== 'ok')
      throw new Error(`operation_search_unavailable:${discovered.kind}`)
    expect(
      discovered.items.map(
        (item: { operationRef: string }) => item.operationRef,
      ),
    ).toContain(published.operationRef)
    const routeable = await backend.query(
      internal.capabilitySupply.listRouteable,
      {
        networkId: 'ae:public',
        limit: 10,
        now: Date.now(),
      },
    )
    expect(routeable).toMatchObject({
      kind: 'available',
      supplies: [
        expect.objectContaining({
          publication: expect.objectContaining({
            operationRef: published.operationRef,
            readinessValidUntil: expect.any(Number),
          }),
        }),
      ],
    })
    if (routeable.kind !== 'available')
      throw new Error(`routeable_supply_unavailable:${routeable.reason}`)
    expect(routeable.supplies).toHaveLength(1)

    const operationRef = published.operationRef
    const selected = await source.read(operationRef)
    expect(selected).not.toBeNull()
    if (selected === null) {
      throw new Error('xyz_current_price_not_read')
    }
    expect(selected).toMatchObject({
      operationRef,
      capabilityId: 'xyz.current-price',
      endpointUrl: 'https://xyz-current-price.example.test/price',
      authority: { kind: 'keyless' },
      adapterId: 'http-json:v1',
      method: 'GET',
    })
    expect(isPublicOperationRef(selected.operationRef)).toBe(true)
    expect(selected.operationRef).toBe(operationRef)

    const providerFetch = vi.fn(
      async (_input: URL | RequestInfo, _init?: RequestInit) =>
        new Response(JSON.stringify({ result: '123.45' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const isPublicTarget = vi.fn(async (_url: URL) => true)
    const executed = await executeKeylessOperation(
      { operationRef, input: { request: 'XYZ' } },
      source,
      { fetchImpl: providerFetch, isPublicTarget },
    )
    expect(executed).toMatchObject({
      kind: 'ok',
      operationRef,
      capabilityId: 'xyz.current-price',
      output: { result: '123.45' },
    })
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(isPublicTarget).toHaveBeenCalledTimes(1)

    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'withdraw-xyz-current-price',
      ),
    )
    expect(withdrawn).toMatchObject({
      kind: 'withdrawn',
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })

    providerFetch.mockClear()
    isPublicTarget.mockClear()
    await expect(source.read(operationRef)).resolves.toBeNull()
    const withdrawnRouteable = await backend.query(
      internal.capabilitySupply.listRouteable,
      {
        networkId: 'ae:public',
        limit: 10,
        now: Date.now(),
      },
    )
    expect(withdrawnRouteable).toMatchObject({
      kind: 'available',
      supplies: [],
    })

    const refused = await executeKeylessOperation(
      { operationRef, input: { request: 'XYZ' } },
      source,
      { fetchImpl: providerFetch, isPublicTarget },
    )
    expect(refused).toEqual({
      kind: 'refused',
      operationRef,
      reason: 'operation_not_found',
    })
    expect(providerFetch).not.toHaveBeenCalled()
    expect(isPublicTarget).not.toHaveBeenCalled()
  })
})
