import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [
  path.replace('../../convex/', './'),
  load,
]))

describe('capability publication', () => {
  it('lets the source-bound business owner publish one canonical inactive AE capability', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'independent-one')

    const published = await owner.mutation(api.capabilitySupply.publishCapability, {
      businessId,
      source: {
        kind: 'ae_envelope',
        documentJson: JSON.stringify(capabilityContractV2({
          capabilityId: 'independent.reference.lookup',
          name: 'Independent reference lookup',
        })),
      },
      offering: {
        offeringId: 'offering:independent-one:reference-lookup',
        networkId: 'ae:public',
        presentation: {
          label: 'Independent reference lookup',
          summary: 'Looks up one public reference and returns structured evidence.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 1_200 },
          materialTerms: [{ termId: 'response', label: 'Response', value: 'One structured response' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'No commercial influence.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['business:commercial-neutrality'],
          },
        },
        searchTerms: ['reference', 'lookup'],
        registrationEvidenceRefs: ['business:capability-publication'],
      },
      binding: {
        bindingId: 'binding:independent-one:http',
        endpointUrl: 'https://independent-one.example.test/capabilities/reference-lookup',
        credentialRef: 'env:INDEPENDENT_ONE_CAPABILITY_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['business:http-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['business:no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['business:http-binding'],
      },
      ...operationContext('publish'),
    })

    expect(published).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:independent-one:reference-lookup',
      contractRef: {
        capabilityId: 'independent.reference.lookup',
        version: 1,
        contractDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
      offeringId: 'offering:independent-one:reference-lookup',
      bindingId: 'binding:independent-one:http',
      lifecycle: {
        state: 'inactive',
        reasons: ['admission_unproven', 'conformance_unproven', 'credential_readiness_unobserved', 'health_unobserved'],
      },
    })
    if (published.kind !== 'published') throw new Error(`publication_refused:${published.reason}`)

    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toEqual(published)

    const persisted = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(persisted).toMatchObject({
      contracts: [{ capabilityId: 'independent.reference.lookup', version: 1, status: 'active' }],
      offerings: [{ offeringId: published.offeringId, businessId, status: 'inactive' }],
      bindings: [{
        bindingId: published.bindingId,
        offeringId: published.offeringId,
        admission: 'not_admitted',
        conformance: 'not_conformant',
      }],
    })
  })

  it('fails closed across readiness, stale health, and withdrawal transitions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'lifecycle-one')
    const observer = await adminObserver(backend)
    const input = capabilityPublicationInput(businessId, 'lifecycle-one')
    const published = await owner.mutation(api.capabilitySupply.publishCapability, input)
    if (published.kind !== 'published') throw new Error(`publication_refused:${published.reason}`)

    const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: published.publicationRef,
      expectedRevision: 1,
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: Date.now() + 60_000,
      ...operationContext('observe-ready'),
    })
    expect(observed).toMatchObject({ kind: 'observed', lifecycle: { state: 'inactive' } })

    await admitPublication(backend, observer, published, 'lifecycle-one')
    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toMatchObject({ lifecycle: { state: 'active', reasons: [] } })

    await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) => (
          index.eq('publicationRef', published.publicationRef).eq('revision', 1)
        )).unique()
      if (publication === null) throw new Error('publication_missing')
      await ctx.db.patch(publication._id, { readinessValidUntil: Date.now() - 1 })
    })
    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toMatchObject({ lifecycle: { state: 'inactive', reasons: ['health_stale'] } })

    const withdrawn = await owner.mutation(api.capabilitySupply.withdrawCapability, {
      publicationRef: published.publicationRef,
      expectedRevision: 1,
      ...operationContext('withdraw'),
    })
    expect(withdrawn).toMatchObject({ kind: 'withdrawn', lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] } })
    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toMatchObject({ lifecycle: { state: 'withdrawn' } })
  })

  it('projects two independent publications through one generic graph path', async () => {
    const backend = convexTest(schema, modules)
    const first = await publishedBusinessOwner(backend, 'graph-one')
    const second = await publishedBusinessOwner(backend, 'graph-two')
    const observer = await adminObserver(backend)
    const firstPublished = await first.owner.mutation(
      api.capabilitySupply.publishCapability, capabilityPublicationInput(first.businessId, 'graph-one'),
    )
    const secondPublished = await second.owner.mutation(
      api.capabilitySupply.publishCapability, capabilityPublicationInput(second.businessId, 'graph-two'),
    )
    if (firstPublished.kind !== 'published' || secondPublished.kind !== 'published') {
      throw new Error('independent_publication_refused')
    }

    await admitPublication(backend, observer, firstPublished, 'graph-one')
    await admitPublication(backend, observer, secondPublished, 'graph-two')
    for (const published of [firstPublished, secondPublished]) {
      await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
        publicationRef: published.publicationRef, expectedRevision: 1,
        credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 60_000,
        ...operationContext(`observe-${published.publicationRef}`),
      })
    }
    const graph = await first.owner.query(api.capabilitySupply.queryCapabilityGraph, {
      networkId: 'ae:public', includeInactive: false, limit: 10,
    })
    expect(graph).toMatchObject({
      kind: 'available',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          publicationRef: firstPublished.publicationRef,
          businessId: first.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            claimStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
        expect.objectContaining({
          publicationRef: secondPublished.publicationRef,
          businessId: second.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            claimStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
      ]),
    })
    expect(graph.nodes).toHaveLength(2)
    expect(JSON.stringify(graph)).not.toContain('credentialRef')
    expect(JSON.stringify(graph)).not.toContain('_KEY')
  })

  it('publishes a generic OpenAPI description through the same command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'openapi-one')
    const direct = capabilityPublicationInput(businessId, 'openapi-one')
    const contractDocument = capabilityContractV2({
      capabilityId: 'independent.openapi.lookup', name: 'OpenAPI lookup',
    })
    const { contractFormat: _format, inputSchema, outputSchema, ...contract } = contractDocument
    const published = await owner.mutation(api.capabilitySupply.publishCapability, {
      businessId,
      source: {
        kind: 'openapi_http',
        documentJson: JSON.stringify({
          openapi: '3.1.0', servers: [{ url: 'https://openapi-one.example.test' }],
          paths: { '/lookup': { post: {
            requestBody: { content: { 'application/json': { schema: inputSchema } } },
            responses: { 200: { content: { 'application/json': { schema: outputSchema } } } },
          } } },
        }),
        operation: { path: '/lookup', method: 'post' },
        contract,
        commercial: {
          offering: direct.offering,
          bindingId: direct.binding.bindingId,
          credentialRef: direct.binding.credentialRef,
          registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
          requestTimeoutMs: 5_000,
        },
        evidenceRefs: ['business:openapi-description'],
      },
      ...operationContext('publish-openapi'),
    })
    expect(published).toMatchObject({
      kind: 'published', offeringId: direct.offering.offeringId, bindingId: direct.binding.bindingId,
      lifecycle: { state: 'inactive' },
    })
  })

  it.each(['mcp', 'x402'] as const)('publishes a generic %s description through the production command', async (kind) => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, `${kind}-one`)
    const direct = capabilityPublicationInput(businessId, `${kind}-one`)
    const document = capabilityContractV2({ capabilityId: `independent.${kind}.lookup`, name: `${kind} lookup` })
    const { contractFormat: _format, inputSchema, outputSchema, ...contract } = document
    const commercial = {
      offering: direct.offering, bindingId: direct.binding.bindingId,
      credentialRef: direct.binding.credentialRef,
      registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
      requestTimeoutMs: 5_000,
    }
    const source = kind === 'mcp'
      ? {
          kind,
          serverUrl: 'https://mcp-one.example.test/rpc',
          toolJson: JSON.stringify({ name: 'reference_lookup', inputSchema, outputSchema }),
          protocolVersion: '2025-06-18', contract, commercial,
          evidenceRefs: ['business:mcp-description'],
        }
      : {
          kind,
          resourceJson: JSON.stringify({
            resourceUrl: 'https://x402-one.example.test/lookup', inputSchema, outputSchema,
            price: { currency: 'AUD', amountMinor: 1_200 },
            scheme: 'exact', network: 'eip155:84532',
            asset: '0x0000000000000000000000000000000000000001',
            payTo: '0x0000000000000000000000000000000000000002',
            routeAmountExponent: 2, assetAmountExponent: 6,
          }),
          contract,
          commercial: {
            ...commercial,
            offering: {
              ...commercial.offering,
              presentation: {
                ...commercial.offering.presentation,
                price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
              },
            },
          },
          evidenceRefs: ['business:x402-description'],
        }
    const published = await owner.mutation(api.capabilitySupply.publishCapability, {
      businessId, source, ...operationContext(`publish-${kind}`),
    })
    expect(published).toMatchObject({ kind: 'published', lifecycle: { state: 'inactive' } })
  })

  it('keeps an incompatible refresh observable and fail closed', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'refresh-one')
    const published = await owner.mutation(
      api.capabilitySupply.publishCapability, capabilityPublicationInput(businessId, 'refresh-one'),
    )
    if (published.kind !== 'published') throw new Error(`publication_refused:${published.reason}`)
    const observer = await adminObserver(backend)
    await admitPublication(backend, observer, published, 'refresh-one')
    await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: published.publicationRef, expectedRevision: 1,
      credentialState: 'ready', healthState: 'healthy', validUntil: Date.now() + 60_000,
      ...operationContext('observe-refresh-one'),
    })
    const next = capabilityPublicationInput(businessId, 'refresh-two')
    const incompatibleDocument = capabilityContractV2({
      capabilityId: published.contractRef.capabilityId,
      version: 2,
      name: 'Refresh two lookup',
      outputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
        properties: { changed: { type: 'number' } }, required: ['changed'], additionalProperties: false,
      },
      customerAnnotations: [
        { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
        { annotationId: 'changed', document: 'output', pointer: '/changed', label: 'Changed', role: 'completion_evidence' },
      ],
      evidence: [{ evidenceId: 'changed', outputPointer: '/changed', purpose: 'completion' }],
    })
    const refreshed = await owner.mutation(api.capabilitySupply.refreshCapability, {
      publicationRef: published.publicationRef,
      expectedRevision: 1,
      source: { kind: 'ae_envelope', documentJson: JSON.stringify(incompatibleDocument) },
      offering: next.offering,
      binding: next.binding,
      ...operationContext('refresh-incompatible'),
    })
    expect(refreshed).toMatchObject({
      kind: 'refreshed', revision: 2, disposition: 'incompatible',
      lifecycle: { state: 'incompatible', reasons: ['incompatible_revision'] },
    })
    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toMatchObject({ lifecycle: { state: 'incompatible' } })
    const revisions = await backend.run(async (ctx) => await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => index.eq('publicationRef', published.publicationRef))
      .collect())
    expect(revisions.map(({ revision, disposition }) => ({ revision, disposition }))).toEqual([
      { revision: 1, disposition: 'superseded' },
      { revision: 2, disposition: 'incompatible' },
    ])
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityContractDocuments').collect()))
      .resolves.toHaveLength(1)
    const graph = await owner.query(api.capabilitySupply.queryCapabilityGraph, {
      networkId: 'ae:public', includeInactive: false, limit: 10,
    })
    expect(graph).toMatchObject({ kind: 'available', nodes: [] })
    await expect(backend.query(internal.capabilitySupply.listEligible, {
      networkId: 'ae:public', limit: 10,
    })).resolves.toMatchObject({ kind: 'available', supplies: [] })
  })

  it('preserves lineage when a validated compatible revision replaces current supply', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'compatible-one')
    const firstInput = capabilityPublicationInput(businessId, 'compatible-one')
    const published = await owner.mutation(api.capabilitySupply.publishCapability, firstInput)
    if (published.kind !== 'published') throw new Error(`publication_refused:${published.reason}`)
    const next = capabilityPublicationInput(businessId, 'compatible-two')
    const compatibleDocument = capabilityContractV2({
      capabilityId: published.contractRef.capabilityId, version: 2, name: 'Compatible lookup revision',
    })
    const refreshed = await owner.mutation(api.capabilitySupply.refreshCapability, {
      publicationRef: published.publicationRef, expectedRevision: 1,
      source: { kind: 'ae_envelope', documentJson: JSON.stringify(compatibleDocument) },
      offering: next.offering, binding: next.binding,
      ...operationContext('refresh-compatible'),
    })
    expect(refreshed).toMatchObject({
      kind: 'refreshed', revision: 2, disposition: 'current', lifecycle: { state: 'inactive' },
    })
    const revisions = await backend.run(async (ctx) => await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => index.eq('publicationRef', published.publicationRef))
      .collect())
    expect(revisions.map(({ revision, disposition, supersedesRevision }) => ({
      revision, disposition, supersedesRevision,
    }))).toEqual([
      { revision: 1, disposition: 'superseded', supersedesRevision: undefined },
      { revision: 2, disposition: 'current', supersedesRevision: 1 },
    ])
    await expect(owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: published.publicationRef,
    })).resolves.toMatchObject({ offeringId: next.offering.offeringId, lifecycle: { state: 'inactive' } })
  })
})

function operationContext(suffix: string) {
  return {
    operationKey: `op:capability-publication:${suffix}`,
    correlationId: `corr:capability-publication:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-publication'],
  }
}

async function publishedBusinessOwner(backend: ReturnType<typeof convexTest>, slug: string) {
  const identity = {
    subject: `user_${slug}`,
    issuer: 'https://identity.example',
    tokenIdentifier: `token_${slug}`,
  }
  const businessId = await backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: identity.subject,
      createdAt: 1,
      updatedAt: 1,
    })
    return await ctx.db.insert('businesses', {
      ownerId,
      slug,
      name: slug,
      normalizedName: slug,
      category: 'professional services',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicStatus: 'published',
      trustTier: 'listed',
      claimStatus: 'published',
      sourceHash: `source:${slug}`,
      createdAt: 1,
      updatedAt: 1,
    })
  }) as Id<'businesses'>
  return { businessId, owner: backend.withIdentity(identity) }
}

function capabilityPublicationInput(businessId: Id<'businesses'>, suffix: string) {
  return {
    businessId,
    source: {
      kind: 'ae_envelope' as const,
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: `independent.${suffix}.lookup`,
        name: `${suffix} lookup`,
      })),
    },
    offering: {
      offeringId: `offering:${suffix}:lookup`,
      networkId: 'ae:public',
      presentation: {
        label: `${suffix} lookup`, summary: 'Returns one structured result.',
        price: { kind: 'on_request' as const }, materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const, summary: 'No commercial influence.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['business:neutral'],
        },
      },
      searchTerms: ['lookup'], registrationEvidenceRefs: ['business:publication'],
    },
    binding: {
      bindingId: `binding:${suffix}:http`,
      endpointUrl: `https://${suffix}.example.test/lookup`,
      credentialRef: `env:${suffix.toUpperCase().replaceAll('-', '_')}_KEY`,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['business:binding'],
    },
    ...operationContext(`publish-${suffix}`),
  }
}

async function adminObserver(backend: ReturnType<typeof convexTest>) {
  const identity = {
    subject: 'user_capability_publication_observer',
    issuer: 'https://identity.example',
    tokenIdentifier: 'token_capability_publication_observer',
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('adminMemberships', {
      clerkUserId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      role: 'owner_admin', state: 'active', grantedBy: 'test_bootstrap', grantedAt: 1,
    })
  })
  return backend.withIdentity(identity)
}

async function admitPublication(
  backend: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof adminObserver>>,
  publication: Readonly<{ offeringId: string; bindingId: string; contractRef: {
    capabilityId: string; version: number; contractDigest: string
  } }>,
  suffix: string,
) {
  const hashes = await backend.run(async (ctx) => {
    const offering = (await ctx.db.query('capabilityOfferings').collect())
      .find((row) => row.offeringId === publication.offeringId) ?? null
    const binding = (await ctx.db.query('capabilityTransportBindings').collect())
      .find((row) => row.bindingId === publication.bindingId) ?? null
    if (offering === null || binding === null) throw new Error('publication_supply_missing')
    return { offering: offering.registrationHash, binding: binding.registrationHash }
  })
  const admitted = await admin.mutation(api.capabilitySupply.setEligibility, {
    offeringId: publication.offeringId, bindingId: publication.bindingId,
    contractRef: publication.contractRef, decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering,
    expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: [`test:admission:${suffix}`],
    conformanceEvidenceRefs: [`test:conformance:${suffix}`],
    ...operationContext(`admit-${suffix}`),
  })
  expect(admitted.kind).toBe('eligible')
}
