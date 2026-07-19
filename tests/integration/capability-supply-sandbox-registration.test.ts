import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxV2SupplyRegistrations,
} from '../../convex/devSeed'
import {
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import { registerCapabilityContractDocument } from '../../convex/capabilityContractDocuments'
import schema from '../../convex/schema'
import { runtimeDb } from '../../convex/source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import {
  SANDBOX_PROVIDER_PROFILES,
  SANDBOX_ROUTE_PROVIDER_PROFILES,
  SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT,
  SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT,
} from '@/modules/sandbox-supply/public'
import {
  SANDBOX_WORKFLOW_PROVIDER_PROFILES,
  historicalItineraryBuilderCapabilityContractDocument,
  historicalProcurementBriefCapabilityContractDocument,
  sandboxWorkflowCapabilityContractDocument,
  type SandboxWorkflowProviderKey,
} from '@/modules/sandbox-supply/workflow-cohorts'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('labelled sandbox V2 capability supply', () => {
  it('binds labelled sandbox businesses to an explicit authenticated dev owner idempotently', async () => {
    const backend = convexTest(schema, modules)
    const ownerClerkUserId = 'user_dev_business_owner'

    const first = await backend.mutation(
      internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply,
      { ownerClerkUserId },
    )
    const replay = await backend.mutation(
      internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply,
      { ownerClerkUserId },
    )

    expect(first.ownerClerkUserId).toBe(ownerClerkUserId)
    expect(replay.ownerClerkUserId).toBe(ownerClerkUserId)
    const businesses = await backend.run((ctx) => ctx.db.query('businesses').collect())
    const owners = await backend.run((ctx) => ctx.db.query('owners').collect())
    const claims = await backend.run((ctx) => ctx.db.query('claims').collect())
    const owner = owners.find((candidate) => candidate.clerkUserId === ownerClerkUserId)
    expect(owner).toBeDefined()
    const labelledBusinesses = businesses.filter((business) => business.slug.startsWith('sandbox-'))
    expect(labelledBusinesses.length).toBeGreaterThan(0)
    expect(labelledBusinesses.every((business) => business.ownerId === owner?._id)).toBe(true)
    expect(claims
      .filter((claim) => claim.businessId !== undefined
        && labelledBusinesses.some((business) => business._id === claim.businessId))
      .every((claim) => claim.ownerId === owner?._id)).toBe(true)
  })

  it('reseeds exact labelled sandbox businesses after an authenticated dev-owner transfer', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {
      ownerClerkUserId: 'user_dev_business_owner',
    })

    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {})).resolves.toMatchObject({
      seededSlugs: expect.arrayContaining([
        'sandbox-route-resolver',
        'sandbox-accessible-transfer',
        'sandbox-itinerary-builder',
      ]),
    })
  })

  it('refuses to adopt an authenticated dev-owner transfer when source context diverges', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {
      ownerClerkUserId: 'user_dev_business_owner',
    })
    await backend.run(async (ctx) => {
      const business = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', 'sandbox-route-resolver')).unique()
      if (business === null) throw new Error('sandbox route resolver missing')
      const context = await ctx.db.query('businessContexts')
        .withIndex('by_business', (query) => query.eq('businessId', business._id)).unique()
      if (context === null) throw new Error('sandbox route resolver context missing')
      await ctx.db.patch(context._id, { ownerMessage: 'Divergent transferred context' })
    })

    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {}))
      .rejects.toThrow('sandbox_business_claim_claim_operation_conflict:sandbox-route-resolver')
  })

  it('registers and admits the three-business procurement workflow through generic supply commands', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.sandboxWorkflowBindings).toEqual(expect.arrayContaining([
      'binding:sandbox-procurement-brief:http-json:v3',
      'binding:sandbox-supplier-options:http-json:v2',
      'binding:sandbox-procurement-recommendation:http-json:v2',
    ]))
    expect(result.sandboxWorkflowPublicationRefs).toEqual(expect.arrayContaining([
      'offering:sandbox-procurement-brief:v3',
      'offering:sandbox-supplier-options:v2',
      'offering:sandbox-procurement-recommendation:v2',
    ]))

    const eligible = await backend.query(internal.capabilitySupply.listEligible, {
      networkId: 'ae:public',
      limit: 32,
    })
    if (eligible.kind !== 'available') throw new Error('sandbox supply unavailable')
    expect(eligible.supplies
      .filter(({ binding }) => binding.bindingId.includes('sandbox-procurement')
        || binding.bindingId.includes('sandbox-supplier-options'))
      .map(({ binding }) => binding.bindingId)
      .sort()).toEqual([
      'binding:sandbox-procurement-brief:http-json:v3',
      'binding:sandbox-procurement-recommendation:http-json:v2',
      'binding:sandbox-supplier-options:http-json:v2',
    ])
  })

  it('registers and admits the three-business itinerary workflow through generic supply commands', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.sandboxWorkflowBindings).toEqual(expect.arrayContaining([
      'binding:sandbox-trip-constraints:http-json:v2',
      'binding:sandbox-itinerary-builder:http-json:v3',
      'binding:sandbox-itinerary-readiness:http-json:v2',
    ]))
    expect(result.sandboxWorkflowPublicationRefs).toEqual(expect.arrayContaining([
      'offering:sandbox-trip-constraints:v2',
      'offering:sandbox-itinerary-builder:v3',
      'offering:sandbox-itinerary-readiness:v2',
    ]))

    const eligible = await backend.query(internal.capabilitySupply.listEligible, {
      networkId: 'ae:public',
      limit: 32,
    })
    if (eligible.kind !== 'available') throw new Error('sandbox supply unavailable')
    expect(eligible.supplies
      .filter(({ binding }) => binding.bindingId.includes('sandbox-trip-constraints')
        || binding.bindingId.includes('sandbox-itinerary-'))
      .map(({ binding }) => binding.bindingId)
      .sort()).toEqual([
      'binding:sandbox-itinerary-builder:http-json:v3',
      'binding:sandbox-itinerary-readiness:http-json:v2',
      'binding:sandbox-trip-constraints:http-json:v2',
    ])
  })

  it('registers and admits the three-business journey-management workflow through generic supply commands', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.sandboxWorkflowBindings).toEqual(expect.arrayContaining([
      'binding:sandbox-journey-case:http-json:v2',
      'binding:sandbox-milestone-plan:http-json:v2',
      'binding:sandbox-progress-synthesis:http-json:v2',
    ]))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('registers a new immutable route generation at the configured provider origin', async () => {
    vi.stubEnv('AE_SANDBOX_ROUTE_RESOLVER_ORIGIN', 'https://resolver.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_QUOTER_ORIGIN', 'https://quoter.test.example')
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.sandboxRouteBindings).toEqual([
      'binding:sandbox-route-resolver:http-json:v6',
      'binding:sandbox-route-quoter:http-json:v5',
    ])
    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    expect(bindings.filter(({ bindingId }) => bindingId.startsWith('binding:sandbox-route-')).map((binding) => ({
      bindingId: binding.bindingId, endpointUrl: binding.endpointUrl,
    }))).toEqual([
      {
        bindingId: 'binding:sandbox-route-resolver:http-json:v6',
        endpointUrl: 'https://resolver.test.example/api/sandbox/providers/route-resolver',
      },
      {
        bindingId: 'binding:sandbox-route-quoter:http-json:v5',
        endpointUrl: 'https://quoter.test.example/api/sandbox/providers/route-quoter',
      },
    ])
    expect(bindings.find(({ bindingId }) =>
      bindingId === 'binding:sandbox-route-resolver:http-json:v6')).toMatchObject({
      cancellation: {
        kind: 'adapter_managed',
        evidenceRefs: ['seed:sandbox-adapter-cancellation'],
      },
      configJson: JSON.stringify({
        cancellation: {
          path: '/api/sandbox/providers/route-resolver',
          requestTimeoutMs: 3_000,
        },
        method: 'POST',
        requestTimeoutMs: 5_000,
      }),
    })
  })

  it('pins the immutable historical sandbox v1 contract identity', () => {
    expect(encodeCapabilityContractDocument(
      SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT,
    ).contract.ref.contractDigest).toBe('sha256:755ed0e0a297adf22152d8ddf8d12dcf8cb5197d805e3d77e67288c7b223ed92')
  })

  it('pins the immutable historical sandbox v2 contract identity', () => {
    expect(encodeCapabilityContractDocument(
      SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT,
    ).contract.ref.contractDigest).toBe('sha256:b59586aab54e68b3993c2e27d8781a40b815c3e0e3a938febeff8386be8dde93')
  })

  it('seeds labelled comparison and composite-route businesses through the normal production command planes', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result).toMatchObject({
      seededSlugs: [
        'sandbox-option-one', 'sandbox-option-two',
        'sandbox-route-resolver', 'sandbox-route-quoter',
        'sandbox-procurement-brief', 'sandbox-supplier-options',
        'sandbox-procurement-recommendation',
        'sandbox-event-requirements', 'sandbox-event-site-evidence',
        'sandbox-event-business-readiness',
        'sandbox-trip-constraints',
        'sandbox-accessible-transfer', 'sandbox-accessible-hotel',
        'sandbox-meeting-schedule', 'sandbox-dinner-plan',
        'sandbox-itinerary-builder',
        'sandbox-itinerary-readiness',
        'sandbox-journey-case', 'sandbox-milestone-plan',
        'sandbox-progress-synthesis',
      ],
      sandboxV2Bindings: [
        'binding:sandbox-option-one:http-json:v4',
        'binding:sandbox-option-two:http-json:v4',
      ],
      sandboxCapabilityPublicationRefs: [
        'offering:sandbox-option-one:reference-lookup:v3',
        'offering:sandbox-option-two:reference-lookup:v3',
      ],
      sandboxRouteBindings: [
        'binding:sandbox-route-resolver:http-json:v6',
        'binding:sandbox-route-quoter:http-json:v5',
      ],
      sandboxRoutePublicationRefs: [
        'offering:sandbox-route-resolver:reference-resolve:v6',
        'offering:sandbox-route-quoter:service-quote:v5',
      ],
    })
    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    expect(bindings).toHaveLength(20)
    expect(bindings.every(({ credentialRef }) => credentialRef === 'env:AE_SANDBOX_PROVIDER_KEY')).toBe(true)
    expect(bindings.filter(({ bindingId }) => bindingId.startsWith('binding:sandbox-route-')).map((binding) => ({
      bindingId: binding.bindingId, endpointUrl: binding.endpointUrl,
    }))).toEqual([
      {
        bindingId: 'binding:sandbox-route-resolver:http-json:v6',
        endpointUrl: 'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-resolver',
      },
      {
        bindingId: 'binding:sandbox-route-quoter:http-json:v5',
        endpointUrl: 'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-quoter',
      },
    ])
    const businesses = await backend.run((ctx) => ctx.db.query('businesses').collect())
    expect(businesses.map((business) => business.slug).sort()).toEqual([
      'sandbox-accessible-hotel',
      'sandbox-accessible-transfer',
      'sandbox-dinner-plan',
      'sandbox-event-business-readiness',
      'sandbox-event-requirements',
      'sandbox-event-site-evidence',
      'sandbox-itinerary-builder',
      'sandbox-itinerary-readiness',
      'sandbox-journey-case',
      'sandbox-meeting-schedule',
      'sandbox-milestone-plan',
      'sandbox-option-one',
      'sandbox-option-two',
      'sandbox-procurement-brief',
      'sandbox-procurement-recommendation',
      'sandbox-progress-synthesis',
      'sandbox-route-quoter',
      'sandbox-route-resolver',
      'sandbox-supplier-options',
      'sandbox-trip-constraints',
    ])
    const publications = await backend.run((ctx) => ctx.db.query('capabilityPublications').collect())
    expect(publications).toMatchObject([
      {
        publicationRef: 'offering:sandbox-option-one:reference-lookup:v3',
        bindingId: 'binding:sandbox-option-one:http-json:v4',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-option-two:reference-lookup:v3',
        bindingId: 'binding:sandbox-option-two:http-json:v4',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-route-resolver:reference-resolve:v6',
        bindingId: 'binding:sandbox-route-resolver:http-json:v6',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-route-quoter:service-quote:v5',
        bindingId: 'binding:sandbox-route-quoter:http-json:v5',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-procurement-brief:v3',
        bindingId: 'binding:sandbox-procurement-brief:http-json:v3',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-supplier-options:v2',
        bindingId: 'binding:sandbox-supplier-options:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-procurement-recommendation:v2',
        bindingId: 'binding:sandbox-procurement-recommendation:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-trip-constraints:v2',
        bindingId: 'binding:sandbox-trip-constraints:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-accessible-transfer:v2',
        bindingId: 'binding:sandbox-accessible-transfer:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-accessible-hotel:v2',
        bindingId: 'binding:sandbox-accessible-hotel:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-meeting-schedule:v2',
        bindingId: 'binding:sandbox-meeting-schedule:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-dinner-plan:v2',
        bindingId: 'binding:sandbox-dinner-plan:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-itinerary-builder:v3',
        bindingId: 'binding:sandbox-itinerary-builder:http-json:v3',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-itinerary-readiness:v2',
        bindingId: 'binding:sandbox-itinerary-readiness:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-event-requirements:v5',
        bindingId: 'binding:sandbox-event-requirements:http-json:v5',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-event-site-evidence:v2',
        bindingId: 'binding:sandbox-event-site-evidence:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-event-business-readiness:v2',
        bindingId: 'binding:sandbox-event-business-readiness:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-journey-case:v2',
        bindingId: 'binding:sandbox-journey-case:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-milestone-plan:v2',
        bindingId: 'binding:sandbox-milestone-plan:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-progress-synthesis:v2',
        bindingId: 'binding:sandbox-progress-synthesis:http-json:v2',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
    ])
  })

  it('keeps superseded comparison options out of the production composite acceptance graph', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {
      includeComparisonOptions: false,
    })

    expect(result.retiredSandboxV2Bindings).toEqual([
      'binding:sandbox-option-one:http-json:v4',
      'binding:sandbox-option-two:http-json:v4',
    ])
    const eligible = await backend.query(internal.capabilitySupply.listEligible, {
      networkId: 'ae:public', limit: 32,
    })
    expect(eligible.kind).toBe('available')
    if (eligible.kind !== 'available') throw new Error('sandbox supply unavailable')
    expect(eligible.supplies.map(({ binding }) => binding.bindingId)).toEqual([
      'binding:sandbox-accessible-hotel:http-json:v2',
      'binding:sandbox-accessible-transfer:http-json:v2',
      'binding:sandbox-dinner-plan:http-json:v2',
      'binding:sandbox-event-business-readiness:http-json:v2',
      'binding:sandbox-event-requirements:http-json:v5',
      'binding:sandbox-event-site-evidence:http-json:v2',
      'binding:sandbox-itinerary-builder:http-json:v3',
      'binding:sandbox-itinerary-readiness:http-json:v2',
      'binding:sandbox-journey-case:http-json:v2',
      'binding:sandbox-meeting-schedule:http-json:v2',
      'binding:sandbox-milestone-plan:http-json:v2',
      'binding:sandbox-procurement-brief:http-json:v3',
      'binding:sandbox-procurement-recommendation:http-json:v2',
      'binding:sandbox-progress-synthesis:http-json:v2',
      'binding:sandbox-route-quoter:http-json:v5',
      'binding:sandbox-route-resolver:http-json:v6',
      'binding:sandbox-supplier-options:http-json:v2',
      'binding:sandbox-trip-constraints:http-json:v2',
    ])
  })

  it('adopts exact pre-existing labelled sandbox identities without overwriting their claim history', async () => {
    const backend = convexTest(schema, modules)
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
      fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
    ))
    const existing = await backend.run((ctx) => (
      registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
    ))

    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.businessIdsBySlug).toMatchObject(existing.businessIdsBySlug)
    expect(Object.keys(result.businessIdsBySlug)).toHaveLength(20)
    expect(result.sandboxV2Bindings).toHaveLength(2)
  })

  it('keeps normally registered sandbox bindings ineligible until explicit evidence-bound admission', async () => {
    const backend = convexTest(schema, modules)
    const registrations = await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      return registerSandboxV2SupplyRegistrations(ctx.db, 3_000)
    })

    await expect(backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 }))
      .resolves.toEqual({ kind: 'available', supplies: [] })

    await backend.run((ctx) => admitSandboxV2Supply(ctx.db, registrations, 3_500))
    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible.kind).toBe('available')
    if (eligible.kind !== 'available') throw new Error('sandbox supply unavailable')
    expect(eligible.supplies.map((supply) => supply.binding.bindingId).sort()).toEqual([
      'binding:sandbox-option-one:http-json:v4',
      'binding:sandbox-option-two:http-json:v4',
    ])
  })

  it('publishes twenty inert businesses through the normal production command planes', async () => {
    const backend = convexTest(schema, modules)
    const first = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const ownerBeforeReplay = await backend.run((ctx) => (
      ctx.db.query('owners').withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', first.ownerClerkUserId)).unique()
    ))
    const replay = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const ownerAfterReplay = await backend.run((ctx) => (
      ctx.db.query('owners').withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', first.ownerClerkUserId)).unique()
    ))
    expect(first.sandboxV2Bindings).toEqual([
      'binding:sandbox-option-one:http-json:v4',
      'binding:sandbox-option-two:http-json:v4',
    ])
    expect(replay.sandboxV2Bindings).toEqual(first.sandboxV2Bindings)
    expect(first.sandboxCapabilityPublicationRef).toBe('offering:sandbox-option-one:reference-lookup:v3')
    expect(replay.sandboxCapabilityPublicationRef).toBe(first.sandboxCapabilityPublicationRef)
    expect(ownerAfterReplay).toEqual(ownerBeforeReplay)

    const state = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
      supplyOperations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply')
      )).collect(),
      catalogOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.operationName === 'publishBusinessCatalog'
        && operation.key.startsWith('seed:catalog:sandbox-')
      )),
      claimOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.operationName === 'claimBusiness'
        && operation.key.startsWith('seed:claim:sandbox-')
      )),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(state.publications).toMatchObject([
      {
        publicationRef: first.sandboxCapabilityPublicationRef,
        bindingId: 'binding:sandbox-option-one:http-json:v4',
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      },
      {
        publicationRef: 'offering:sandbox-option-two:reference-lookup:v3',
        bindingId: 'binding:sandbox-option-two:http-json:v4',
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      },
      {
        publicationRef: 'offering:sandbox-route-resolver:reference-resolve:v6',
        bindingId: 'binding:sandbox-route-resolver:http-json:v6',
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      },
      {
        publicationRef: 'offering:sandbox-route-quoter:service-quote:v5',
        bindingId: 'binding:sandbox-route-quoter:http-json:v5',
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      },
    ])
    expect(state.bindings.find((binding) => binding.bindingId === state.publications[0]?.bindingId))
      .toMatchObject({ credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY' })
    await expect(backend.query(api.capabilitySupply.queryCapabilityGraph, {
      networkId: 'ae:public', includeInactive: false, limit: 10,
    })).resolves.toMatchObject({
      kind: 'available',
      nodes: [],
    })
    expect(state.contracts).toHaveLength(3)
    expect(state.contracts.map(({ capabilityId, version, status }) => ({ capabilityId, version, status }))).toEqual([
      { capabilityId: 'sandbox.reference.lookup', version: 3, status: 'active' },
      { capabilityId: 'sandbox.route.reference.resolve', version: 1, status: 'active' },
      { capabilityId: 'sandbox.route.service.quote', version: 1, status: 'active' },
    ])
    expect(state.offerings).toHaveLength(4)
    expect(state.bindings).toHaveLength(4)
    expect(new Set(state.offerings.map((offering) => offering.businessId)).size).toBe(4)
    const registeredContracts = new Set(state.contracts.map((contract) => (
      `${contract.capabilityId}:${contract.version}:${contract.contractDigest}`
    )))
    expect(state.offerings.every((offering) => (
      registeredContracts.has(`${offering.capabilityId}:${offering.version}:${offering.contractDigest}`)
      && offering.status === 'active'
    ))).toBe(true)
    expect(state.bindings.every((binding) => (
      registeredContracts.has(`${binding.capabilityId}:${binding.version}:${binding.contractDigest}`)
      && binding.admission === 'admitted'
      && binding.conformance === 'conformant'
      && binding.adapterId === 'http-json:v1'
    ))).toBe(true)
    expect(JSON.stringify({ offerings: state.offerings, bindings: state.bindings })).not.toContain('"operation"')
    expect(state.supplyOperations).toHaveLength(12)
    expect(state.supplyOperations.every((operation) => operation.actorKind === 'system' && operation.status === 'succeeded')).toBe(true)
    expect(state.catalogOperations).toHaveLength(20)
    expect(state.catalogOperations.every((operation) => operation.status === 'succeeded')).toBe(true)
    expect(state.claimOperations).toHaveLength(20)
    expect(state.claimOperations.every((operation) => operation.status === 'succeeded')).toBe(true)
    expect(state.audits.filter((audit) => (
      audit.eventType.startsWith('capability_')
    ))).toHaveLength(16)
    expect(state.audits.filter((audit) => audit.eventType.startsWith('capability_')).every((audit) => (
      audit.actorKind === 'system' && audit.actorRef === 'system:dev-seed'
    ))).toBe(true)
    expect(state.audits.filter((audit) => audit.eventType === 'capability_supply.eligibility_changed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetType: 'capability_offering', beforeState: 'inactive', afterState: 'active' }),
        expect.objectContaining({ targetType: 'capability_binding', beforeState: 'not_admitted:not_conformant', afterState: 'admitted:conformant' }),
      ]),
    )
    expect(state.audits.filter((audit) => (
      audit.eventType === 'claim.published' && audit.slug?.startsWith('sandbox-')
    ))).toHaveLength(20)

    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible).toMatchObject({
      kind: 'available',
      supplies: [
        { binding: { bindingId: 'binding:sandbox-option-one:http-json:v4' } },
        { binding: { bindingId: 'binding:sandbox-option-two:http-json:v4' } },
        { binding: { bindingId: 'binding:sandbox-route-quoter:http-json:v5' } },
        { binding: { bindingId: 'binding:sandbox-route-resolver:http-json:v6' } },
      ],
    })
  })

  it('adopts exact sandbox identities created by an older seed generation', async () => {
    const backend = convexTest(schema, modules)
    const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => fixture.requestedSlug.startsWith('sandbox-'))
    const existing = await backend.run((ctx) => (
      registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
    ))
    await backend.run(async (ctx) => {
      const operations = await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'business_claim')
      )).collect()
      for (const operation of operations) {
        if (operation.key.startsWith('seed:claim:sandbox-')) {
          await ctx.db.patch(operation._id, { key: `legacy:${operation.key}` })
        }
      }
    })

    const replay = await backend.mutation(internal.devSeed.seedDevCatalog, {})

    expect(replay.businessIdsBySlug).toMatchObject(existing.businessIdsBySlug)
    expect(replay.sandboxRouteBindings).toEqual([
      'binding:sandbox-route-resolver:http-json:v6',
      'binding:sandbox-route-quoter:http-json:v5',
    ])
  })

  it('does not promote a published listing without an offering and binding into V2 supply', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.run(async (ctx) => {
      const template = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', 'sandbox-option-one')).unique()
      if (template === null) throw new Error('sandbox template missing')
      const { _id, _creationTime, ...business } = template
      void _id
      void _creationTime
      await ctx.db.insert('businesses', { ...business, slug: 'sandbox-listing-only-v2', name: 'Sandbox Listing Only V2' })
    })

    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible.kind).toBe('available')
    if (eligible.kind !== 'available') throw new Error('sandbox supply unavailable')
    expect(eligible.supplies.map((supply) => supply.binding.bindingId).sort()).toEqual([
      'binding:sandbox-option-one:http-json:v4',
      'binding:sandbox-option-two:http-json:v4',
      'binding:sandbox-route-quoter:http-json:v5',
      'binding:sandbox-route-resolver:http-json:v6',
    ])
    const registrations = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(registrations.offerings).toHaveLength(4)
    expect(registrations.bindings).toHaveLength(4)
  })

  it('retires stale sandbox bindings through the eligibility command when corrected bindings are published', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerLegacySandboxSupply(ctx.db)
      await registerPriorV2SandboxSupply(ctx.db)
      await retireOriginalLegacySandboxBindings(ctx.db)
    })
    const priorRetirement = await backend.run(async (ctx) => ({
      operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key === 'seed:capability-binding-retire:binding:sandbox-option-one:http-json'
        || operation.key === 'seed:capability-binding-retire:binding:sandbox-option-two:http-json'
      )),
      audits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
        audit.targetRef === 'binding:sandbox-option-one:http-json'
        || audit.targetRef === 'binding:sandbox-option-two:http-json'
      )),
    }))

    const migrated = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const replayedPriorRetirement = await backend.run(async (ctx) => ({
      operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key === 'seed:capability-binding-retire:binding:sandbox-option-one:http-json'
        || operation.key === 'seed:capability-binding-retire:binding:sandbox-option-two:http-json'
      )),
      audits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
        audit.targetRef === 'binding:sandbox-option-one:http-json'
        || audit.targetRef === 'binding:sandbox-option-two:http-json'
      )),
    }))
    expect(replayedPriorRetirement).toEqual(priorRetirement)

    const beforeReplay = await backend.run(async (ctx) => ({
      retirementOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key.startsWith('seed:capability-binding-retire:')
      )),
      retirementAudits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
        audit.targetRef === 'binding:sandbox-option-one:http-json'
        || audit.targetRef === 'binding:sandbox-option-two:http-json'
        || audit.targetRef === 'binding:sandbox-option-one:http-json:v2'
        || audit.targetRef === 'binding:sandbox-option-two:http-json:v2'
        || audit.targetRef === 'binding:sandbox-option-one:http-json:v3'
        || audit.targetRef === 'binding:sandbox-option-two:http-json:v3'
      )),
    }))
    const replay = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterReplay = await backend.run(async (ctx) => ({
      retirementOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key.startsWith('seed:capability-binding-retire:')
      )),
      retirementAudits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
        audit.targetRef === 'binding:sandbox-option-one:http-json'
        || audit.targetRef === 'binding:sandbox-option-two:http-json'
        || audit.targetRef === 'binding:sandbox-option-one:http-json:v2'
        || audit.targetRef === 'binding:sandbox-option-two:http-json:v2'
        || audit.targetRef === 'binding:sandbox-option-one:http-json:v3'
        || audit.targetRef === 'binding:sandbox-option-two:http-json:v3'
      )),
    }))
    expect(replay).toEqual(migrated)
    expect(afterReplay).toEqual(beforeReplay)

    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    const bindingState = (binding: typeof bindings[number]) => ({
      bindingId: binding.bindingId, credentialRef: binding.credentialRef,
      admission: binding.admission, conformance: binding.conformance,
    })
    expect(bindings.filter((binding) => (
      binding.bindingId.includes('sandbox-option-') && binding.bindingId.endsWith(':v4')
    )).map(bindingState)).toEqual([
      {
        bindingId: 'binding:sandbox-option-one:http-json:v4', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'admitted', conformance: 'conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json:v4', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'admitted', conformance: 'conformant',
      },
    ])
    expect(bindings.filter((binding) => (
      binding.bindingId.includes('sandbox-option-') && !binding.bindingId.endsWith(':v4')
    )).map(bindingState)).toEqual([
      {
        bindingId: 'binding:sandbox-option-one:http-json', credentialRef: 'env:AE_SANDBOX_PROVIDER_ONE_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-one:http-json:v2', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json', credentialRef: 'env:AE_SANDBOX_PROVIDER_TWO_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json:v2', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-one:http-json:v3', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json:v3', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
    ])
  })

  it('retires exact historical route v1 supply after corrected route supply is published and replays idempotently', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db)
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalRouteV1Retirement(backend)
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-route-quoter:http-json:v1', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-route-resolver:http-json:v1', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(2)
    expect(afterMigration.audits).toHaveLength(4)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalRouteV1Retirement(backend)).resolves.toEqual(afterMigration)
  })

  it('retires exact historical procurement v1 supply after corrected workflow supply is published and replays idempotently', async () => {
    vi.stubEnv('AE_SANDBOX_WORKFLOW_ORIGIN', 'https://workflow-provider.example.test')
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-procurement-brief'
        || fixture.requestedSlug === 'sandbox-supplier-options'
        || fixture.requestedSlug === 'sandbox-procurement-recommendation'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalProcurementV1Supply(ctx.db, {
        workflowOrigin: 'https://workflow-provider.example.test',
      })
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalProcurementV1Retirement(backend)
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-procurement-brief:http-json:v2', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-procurement-recommendation:http-json:v1', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-supplier-options:http-json:v1', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(3)
    expect(afterMigration.audits).toHaveLength(6)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalProcurementV1Retirement(backend)).resolves.toEqual(afterMigration)
  })

  it('retires the exact historical itinerary builder before admitting its component-aware generation', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-itinerary-builder'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalItineraryBuilderV2Supply(ctx.db)
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalItineraryBuilderRetirement(backend)
    expect(afterMigration.bindings).toEqual([{
      bindingId: 'binding:sandbox-itinerary-builder:http-json:v2',
      admission: 'not_admitted', conformance: 'not_conformant',
    }])
    expect(afterMigration.current).toEqual([{
      bindingId: 'binding:sandbox-itinerary-builder:http-json:v3',
      admission: 'admitted', conformance: 'conformant', version: 2,
    }])
    expect(afterMigration.operations).toHaveLength(1)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalItineraryBuilderRetirement(backend)).resolves.toEqual(afterMigration)
  })

  it('refuses to retire a reserved historical procurement binding at a different provider endpoint', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-procurement-brief'
        || fixture.requestedSlug === 'sandbox-supplier-options'
        || fixture.requestedSlug === 'sandbox-procurement-recommendation'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalProcurementV1Supply(ctx.db, {
        briefEndpointUrl: 'https://wrong-provider.example.test/capability',
      })
    })

    await expect(backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {}))
      .rejects.toThrow(
        'sandbox_workflow_historical_identity_mismatch_binding:sandbox-procurement-brief:http-json:v2',
      )
  })

  it('retires exact historical route v2 supply when the provider origin changes and replays idempotently', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db, { generation: 'v2' })
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalRouteRetirement(backend, ':v2')
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-route-quoter:http-json:v2', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-route-resolver:http-json:v2', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(2)
    expect(afterMigration.audits).toHaveLength(4)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalRouteRetirement(backend, ':v2')).resolves.toEqual(afterMigration)
  })

  it('retires exact historical route v3 supply before adopting distinct provider origins and replays idempotently', async () => {
    vi.stubEnv('AE_SANDBOX_PROVIDER_ORIGIN', 'https://shared-provider.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_RESOLVER_ORIGIN', 'https://resolver.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_QUOTER_ORIGIN', 'https://quoter.test.example')
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db, { generation: 'v3' })
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalRouteRetirement(backend, ':v3')
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-route-quoter:http-json:v3', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-route-resolver:http-json:v3', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(2)
    expect(afterMigration.audits).toHaveLength(4)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalRouteRetirement(backend, ':v3')).resolves.toEqual(afterMigration)
  })

  it('retires exact historical route v4 supply before adopting stable Funnel origins and replays idempotently', async () => {
    vi.stubEnv('AE_SANDBOX_ROUTE_RESOLVER_V4_ORIGIN', 'https://resolver-old.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_QUOTER_V4_ORIGIN', 'https://quoter-old.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_RESOLVER_ORIGIN', 'https://resolver-funnel.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_QUOTER_ORIGIN', 'https://quoter-funnel.test.example')
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db, { generation: 'v4' })
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalRouteRetirement(backend, ':v4')
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-route-quoter:http-json:v4', admission: 'not_admitted', conformance: 'not_conformant' },
      { bindingId: 'binding:sandbox-route-resolver:http-json:v4', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(2)
    expect(afterMigration.audits).toHaveLength(4)

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalRouteRetirement(backend, ':v4')).resolves.toEqual(afterMigration)
  })

  it('retires exact historical resolver v5 supply before admitting adapter cancellation and replays idempotently', async () => {
    vi.stubEnv('AE_SANDBOX_ROUTE_RESOLVER_ORIGIN', 'https://resolver-funnel.test.example')
    vi.stubEnv('AE_SANDBOX_ROUTE_QUOTER_ORIGIN', 'https://quoter-funnel.test.example')
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db, { generation: 'v5', routeKeys: ['resolver'] })
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    const afterMigration = await readHistoricalRouteRetirement(backend, ':v5')
    expect(afterMigration.bindings).toEqual([
      { bindingId: 'binding:sandbox-route-quoter:http-json:v5', admission: 'admitted', conformance: 'conformant' },
      { bindingId: 'binding:sandbox-route-resolver:http-json:v5', admission: 'not_admitted', conformance: 'not_conformant' },
    ])
    expect(afterMigration.operations).toHaveLength(1)
    expect(afterMigration.audits).toHaveLength(2)

    const currentResolver = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq(
        'bindingId',
        'binding:sandbox-route-resolver:http-json:v6',
      ))
      .unique())
    expect(currentResolver).toMatchObject({
      bindingId: 'binding:sandbox-route-resolver:http-json:v6',
      admission: 'admitted',
      conformance: 'conformant',
      cancellation: {
        kind: 'adapter_managed',
        evidenceRefs: ['seed:sandbox-adapter-cancellation'],
      },
    })

    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await expect(readHistoricalRouteRetirement(backend, ':v5')).resolves.toEqual(afterMigration)
  })

  it('refuses to retire a reserved historical route binding at a different provider endpoint', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-route-resolver' || fixture.requestedSlug === 'sandbox-route-quoter'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerHistoricalRouteV1Supply(ctx.db, {
        resolverEndpointUrl: 'https://wrong-provider.example.test/capability',
      })
    })

    await expect(backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {}))
      .rejects.toThrow('sandbox_route_historical_identity_mismatch_binding:sandbox-route-resolver:http-json:v1')
  })

  it('refuses to retire a reserved legacy binding whose registered identity is not the sandbox identity', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerLegacySandboxSupply(ctx.db, {
        firstLegacyEndpointOverride: 'https://wrong-provider.example.test/capability',
      })
    })

    await expect(backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {}))
      .rejects.toThrow('sandbox_v2_legacy_binding_identity_mismatch_binding:sandbox-option-one:http-json')
  })

  it('refuses to retire a legacy offering registered to a different published business', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      const expected = await ctx.db.query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', 'sandbox-option-one')).unique()
      if (expected === null) throw new Error('sandbox business missing')
      const { _id, _creationTime, ...business } = expected
      void _id
      void _creationTime
      await ctx.db.insert('businesses', { ...business, slug: 'sandbox-wrong-business', name: 'Sandbox Wrong Business' })
      await registerLegacySandboxSupply(ctx.db, { firstOfferingBusinessSlug: 'sandbox-wrong-business' })
    })

    await expect(backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {}))
      .rejects.toThrow('sandbox_v2_legacy_binding_identity_mismatch_binding:sandbox-option-one:http-json')
  })

  it('refuses to retire a legacy binding with different adapter configuration', async () => {
    const backend = convexTest(schema, modules)
    await backend.run(async (ctx) => {
      const fixtures = DEV_SEED_BUSINESS_FIXTURES.filter((fixture) => (
        fixture.requestedSlug === 'sandbox-option-one' || fixture.requestedSlug === 'sandbox-option-two'
      ))
      await registerSandboxBusinesses(runtimeDb(ctx.db), fixtures, 1_000)
      await registerLegacySandboxSupply(ctx.db, { firstLegacyRequestTimeoutMs: 4_000 })
    })

    await expect(backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {}))
      .rejects.toThrow('sandbox_v2_legacy_binding_identity_mismatch_binding:sandbox-option-one:http-json')
  })

  it('refuses a sandbox claim replay when its durable result receipt is corrupt', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.run(async (ctx) => {
      const operation = await ctx.db
        .query('operationKeys')
        .withIndex('by_scope_key', (query) => query.eq('scope', 'business_claim').eq('key', 'seed:claim:sandbox-option-one'))
        .unique()
      if (operation === null) throw new Error('sandbox claim operation missing')
      await ctx.db.patch(operation._id, { resultHash: 'sha256:corrupt' })
    })

    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {}))
      .rejects.toThrow('sandbox_business_claim_claim_operation_conflict')
  })

  it('refuses replay when persisted sandbox identity content diverges from its durable receipt', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.devSeed.seedDevCatalog, {})
    await backend.run(async (ctx) => {
      const business = await ctx.db
        .query('businesses')
        .withIndex('by_slug', (query) => query.eq('slug', 'sandbox-option-one'))
        .unique()
      if (business === null) throw new Error('sandbox business missing')
      await ctx.db.patch(business._id, { name: 'Corrupt Sandbox Identity' })
    })

    await expect(backend.mutation(internal.devSeed.seedDevCatalog, {}))
      .rejects.toThrow('sandbox_business_claim_claim_operation_conflict')
  })
})

async function registerLegacySandboxSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  options: Readonly<{
    firstLegacyEndpointOverride?: string
    firstLegacyRequestTimeoutMs?: number
    firstOfferingBusinessSlug?: string
  }> = {},
): Promise<void> {
  const encoded = encodeCapabilityContractDocument(SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT)
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, 2_000)
  if (contract.kind !== 'registered') throw new Error(`legacy contract registration failed: ${contract.reason}`)
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const businessSlug = profileKey === 'one' && options.firstOfferingBusinessSlug !== undefined
      ? options.firstOfferingBusinessSlug
      : profile.slug
    const business = await db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', businessSlug)).unique()
    if (business === null) throw new Error('legacy sandbox business missing')
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:legacy-offering:${profile.priorOfferingId}`,
        correlationId: `test:legacy-supply:${profile.slug}`,
        reasonCode: 'test_legacy_registration', evidenceRefs: ['test:legacy-supply'],
      },
      registration: {
        offeringId: profile.priorOfferingId, businessId: business._id, networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label, summary: 'Legacy labelled sandbox supply.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only.' }],
          commercialRelationship: {
            kind: 'none', summary: 'No commercial relationship.', influencesEligibility: false,
            influencesInclusion: false, influencesOrder: false, evidenceRefs: ['test:legacy-supply'],
          },
        },
        searchTerms: [...profile.queryTerms], registrationEvidenceRefs: ['test:legacy-supply'],
      },
    }, 2_100)
    if (offering.kind !== 'registered') throw new Error(`legacy offering registration failed: ${offering.reason}`)
    const bindings = [
      {
        bindingId: profile.legacyV2BindingId,
        endpointUrl: profileKey === 'one' && options.firstLegacyEndpointOverride !== undefined
          ? options.firstLegacyEndpointOverride
          : `https://agentic-economy-phi.vercel.app/api/sandbox/capability?profile=${profileKey}`,
        credentialRef: `env:AE_SANDBOX_PROVIDER_${profileKey.toUpperCase()}_KEY`,
      },
      {
        bindingId: profile.priorV2BindingId,
        endpointUrl: `https://agentic-economy-phi.vercel.app/api/sandbox/capability?profile=${profileKey}&binding=v2`,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
      },
    ]
    for (const bindingInput of bindings) {
      const binding = await registerCapabilityBindingCommand(db, {
        actor: { kind: 'system', ref: 'system:migration-test' },
        context: {
          operationKey: `test:legacy-binding:${bindingInput.bindingId}`,
          correlationId: `test:legacy-supply:${profile.slug}`,
          reasonCode: 'test_legacy_registration', evidenceRefs: ['test:legacy-supply'],
        },
        registration: {
          ...bindingInput, offeringId: profile.priorOfferingId, networkId: 'ae:public', contractRef: contract.ref,
          continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
          cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
          adapter: {
            adapterId: 'http-json:v1',
            config: {
              method: 'POST',
              requestTimeoutMs: profileKey === 'one' && options.firstLegacyRequestTimeoutMs !== undefined
                ? options.firstLegacyRequestTimeoutMs
                : 5_000,
            },
          },
          registrationEvidenceRefs: ['seed:production-v2-registration-path'],
        },
      }, 2_200)
      if (binding.kind !== 'registered') throw new Error(`legacy binding registration failed: ${binding.reason}`)
      const admitted = await setCapabilitySupplyEligibilityCommand(db, {
        actor: { kind: 'system', ref: 'system:migration-test' },
        context: {
          operationKey: `test:legacy-admission:${bindingInput.bindingId}`,
          correlationId: `test:legacy-supply:${profile.slug}`,
          reasonCode: 'test_legacy_admission', evidenceRefs: ['test:legacy-supply'],
        },
        eligibility: {
          offeringId: profile.priorOfferingId, bindingId: binding.bindingId, contractRef: contract.ref,
          decision: 'admit', expectedOfferingRegistrationHash: offering.registrationHash,
          expectedBindingRegistrationHash: binding.registrationHash,
          admissionEvidenceRefs: ['test:legacy-supply'], conformanceEvidenceRefs: ['test:legacy-supply'],
        },
      }, 2_300)
      if (admitted.kind !== 'eligible') throw new Error(`legacy admission failed: ${admitted.kind}`)
    }
  }
}

async function registerPriorV2SandboxSupply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
): Promise<void> {
  const encoded = encodeCapabilityContractDocument(SANDBOX_V2_PRIOR_CAPABILITY_CONTRACT_DOCUMENT)
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, 2_500)
  if (contract.kind !== 'registered') throw new Error(`prior V2 contract registration failed: ${contract.reason}`)
  for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`prior V2 business missing: ${profile.slug}`)
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:prior-v2-offering:${profile.priorV2OfferingId}`,
        correlationId: `test:prior-v2-supply:${profile.slug}`,
        reasonCode: 'test_prior_v2_registration', evidenceRefs: ['test:prior-v2-supply'],
      },
      registration: {
        offeringId: profile.priorV2OfferingId, businessId: business._id, networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label, summary: 'Prior V2 labelled sandbox supply.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only.' }],
          commercialRelationship: {
            kind: 'none', summary: 'No commercial relationship.', influencesEligibility: false,
            influencesInclusion: false, influencesOrder: false, evidenceRefs: ['test:prior-v2-supply'],
          },
        },
        searchTerms: [...profile.queryTerms], registrationEvidenceRefs: ['test:prior-v2-supply'],
      },
    }, 2_600)
    if (offering.kind !== 'registered') throw new Error(`prior V2 offering registration failed: ${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:prior-v2-binding:${profile.v2BindingId}`,
        correlationId: `test:prior-v2-supply:${profile.slug}`,
        reasonCode: 'test_prior_v2_registration', evidenceRefs: ['test:prior-v2-supply'],
      },
      registration: {
        bindingId: profile.v2BindingId, offeringId: profile.priorV2OfferingId,
        networkId: 'ae:public', contractRef: contract.ref,
        endpointUrl: `https://agentic-economy-phi.vercel.app/api/sandbox/capability?profile=${profileKey}&binding=v3`,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, 2_700)
    if (binding.kind !== 'registered') throw new Error(`prior V2 binding registration failed: ${binding.reason}`)
    const admitted = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:prior-v2-admission:${profile.v2BindingId}`,
        correlationId: `test:prior-v2-supply:${profile.slug}`,
        reasonCode: 'test_prior_v2_admission', evidenceRefs: ['test:prior-v2-supply'],
      },
      eligibility: {
        offeringId: profile.priorV2OfferingId, bindingId: profile.v2BindingId,
        contractRef: contract.ref, decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:prior-v2-supply'],
        conformanceEvidenceRefs: ['test:prior-v2-supply'],
      },
    }, 2_800)
    if (admitted.kind !== 'eligible') throw new Error(`prior V2 admission failed: ${admitted.kind}`)
  }
}

async function retireOriginalLegacySandboxBindings(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
): Promise<void> {
  const contractRef = encodeCapabilityContractDocument(SANDBOX_V2_LEGACY_CAPABILITY_CONTRACT_DOCUMENT).contract.ref
  for (const profile of Object.values(SANDBOX_PROVIDER_PROFILES)) {
    const offering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.priorOfferingId)).unique()
    const binding = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.legacyV2BindingId)).unique()
    if (offering === null || binding === null) throw new Error('original legacy supply missing')
    const retired = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:dev-seed' },
      context: {
        operationKey: `seed:capability-binding-retire:${profile.legacyV2BindingId}`,
        correlationId: `seed:capability-supply:${profile.slug}`,
        reasonCode: 'labelled_sandbox_binding_replaced',
        evidenceRefs: ['seed:sandbox-shared-provider-credential'],
      },
      eligibility: {
        offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef, decision: 'revoke',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['seed:sandbox-shared-provider-credential'],
        conformanceEvidenceRefs: ['seed:sandbox-shared-provider-credential'],
      },
    }, 2_400)
    if (retired.kind !== 'ineligible') throw new Error(`original legacy retirement failed: ${retired.kind}`)
  }
}

async function registerHistoricalRouteV1Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  options: Readonly<{
    resolverEndpointUrl?: string
    generation?: 'v1' | 'v2' | 'v3' | 'v4' | 'v5'
    routeKeys?: ReadonlyArray<'resolver' | 'quoter'>
  }> = {},
): Promise<void> {
  for (const [routeKey, profile] of Object.entries(SANDBOX_ROUTE_PROVIDER_PROFILES)) {
    if (options.routeKeys !== undefined && !options.routeKeys.includes(routeKey as 'resolver' | 'quoter')) continue
    if (options.generation === 'v5' && !('priorV5OfferingId' in profile)) {
      throw new Error(`historical route v5 identity missing: ${routeKey}`)
    }
    const offeringId = options.generation === 'v5' && 'priorV5OfferingId' in profile
      ? profile.priorV5OfferingId
      : options.generation === 'v4'
      ? profile.priorV4OfferingId
      : options.generation === 'v3'
      ? profile.priorV3OfferingId
      : options.generation === 'v2'
        ? profile.priorV2OfferingId
        : profile.priorOfferingId
    const bindingId = options.generation === 'v5' && 'priorV5BindingId' in profile
      ? profile.priorV5BindingId
      : options.generation === 'v4'
      ? profile.priorV4BindingId
      : options.generation === 'v3'
      ? profile.priorV3BindingId
      : options.generation === 'v2'
        ? profile.priorV2BindingId
        : profile.priorBindingId
    const encoded = encodeCapabilityContractDocument(profile.contract)
    const contract = await registerCapabilityContractDocument(db, encoded.documentJson, 2_000)
    if (contract.kind !== 'registered') throw new Error(`historical route contract failed: ${contract.reason}`)
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`historical route business missing: ${profile.slug}`)
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-route-offering:${offeringId}`,
        correlationId: `test:historical-route-supply:${profile.slug}`,
        reasonCode: 'test_historical_route_registration', evidenceRefs: ['test:historical-route-supply'],
      },
      registration: {
        offeringId, businessId: business._id, networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.label,
          summary: 'Labelled sandbox route supply for source and contract verification only.',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{ termId: 'sandbox_only', label: 'Environment', value: 'Sandbox only; not real supply.' }],
          commercialRelationship: {
            kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [...profile.queryTerms], registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
      },
    }, 2_100)
    if (offering.kind !== 'registered') throw new Error(`historical route offering failed: ${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-route-binding:${bindingId}`,
        correlationId: `test:historical-route-supply:${profile.slug}`,
        reasonCode: 'test_historical_route_registration', evidenceRefs: ['test:historical-route-supply'],
      },
      registration: {
        bindingId, offeringId,
        networkId: 'ae:public', contractRef: contract.ref,
        endpointUrl: routeKey === 'resolver' && options.resolverEndpointUrl !== undefined
          ? options.resolverEndpointUrl
          : options.generation === 'v5'
            ? `${process.env.AE_SANDBOX_ROUTE_RESOLVER_ORIGIN}${profile.endpointPath}`
            : options.generation === 'v4'
            ? `${routeKey === 'resolver'
              ? process.env.AE_SANDBOX_ROUTE_RESOLVER_V4_ORIGIN
              : process.env.AE_SANDBOX_ROUTE_QUOTER_V4_ORIGIN}${profile.endpointPath}`
            : options.generation === 'v3'
            ? `${process.env.AE_SANDBOX_PROVIDER_ORIGIN ?? 'https://agentic-economy-phi.vercel.app'}${profile.endpointPath}`
            : options.generation === 'v2'
            ? `https://agentic-economy-phi.vercel.app${profile.endpointPath}`
            : `https://agentic-economy-phi.vercel.app/api/sandbox/capability?route=${routeKey}`,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, 2_200)
    if (binding.kind !== 'registered') throw new Error(`historical route binding failed: ${binding.reason}`)
    const admitted = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-route-admission:${bindingId}`,
        correlationId: `test:historical-route-supply:${profile.slug}`,
        reasonCode: 'test_historical_route_admission', evidenceRefs: ['test:historical-route-supply'],
      },
      eligibility: {
        offeringId, bindingId,
        contractRef: contract.ref, decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:historical-route-supply'],
        conformanceEvidenceRefs: ['test:historical-route-supply'],
      },
    }, 2_300)
    if (admitted.kind !== 'eligible') throw new Error(`historical route admission failed: ${admitted.kind}`)
  }
}

async function registerHistoricalProcurementV1Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
  options: Readonly<{ briefEndpointUrl?: string; workflowOrigin?: string }> = {},
): Promise<void> {
  const procurementProfiles = Object.entries(SANDBOX_WORKFLOW_PROVIDER_PROFILES)
    .filter(([, profile]) => profile.cohortId === 'procurement')
  for (const [providerKey, profile] of procurementProfiles) {
    const encoded = encodeCapabilityContractDocument(
      providerKey === 'procurement-brief'
        ? historicalProcurementBriefCapabilityContractDocument()
        : sandboxWorkflowCapabilityContractDocument(providerKey as SandboxWorkflowProviderKey),
    )
    const contract = await registerCapabilityContractDocument(db, encoded.documentJson, 2_000)
    if (contract.kind !== 'registered') throw new Error(`historical workflow contract failed: ${contract.reason}`)
    const business = await db.query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
    if (business === null) throw new Error(`historical workflow business missing: ${profile.slug}`)
    const offering = await registerCapabilityOfferingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-workflow-offering:${profile.priorOfferingId}`,
        correlationId: `test:historical-workflow-supply:${profile.slug}`,
        reasonCode: 'test_historical_workflow_registration',
        evidenceRefs: ['test:historical-workflow-supply'],
      },
      registration: {
        offeringId: profile.priorOfferingId,
        businessId: business._id,
        networkId: 'ae:public',
        contractRef: contract.ref,
        presentation: {
          label: profile.capabilityName,
          summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
          price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
          materialTerms: [{
            termId: 'sandbox_only',
            label: 'Environment',
            value: 'Sandbox only; no real supplier order, payment, or fulfilment.',
          }],
          commercialRelationship: {
            kind: 'none',
            summary: 'Sandbox verification has no commercial relationship.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['seed:sandbox-commercial-neutrality'],
          },
        },
        searchTerms: [
          profile.cohortLabel,
          profile.capabilityName,
          'workplace catering supplier recommendation',
        ],
        registrationEvidenceRefs: ['seed:sandbox-labelled-workflow-business'],
      },
    }, 2_100)
    if (offering.kind !== 'registered') throw new Error(`historical workflow offering failed: ${offering.reason}`)
    const binding = await registerCapabilityBindingCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-workflow-binding:${profile.priorBindingId}`,
        correlationId: `test:historical-workflow-supply:${profile.slug}`,
        reasonCode: 'test_historical_workflow_registration',
        evidenceRefs: ['test:historical-workflow-supply'],
      },
      registration: {
        bindingId: profile.priorBindingId,
        offeringId: profile.priorOfferingId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: providerKey === 'procurement-brief' && options.briefEndpointUrl !== undefined
          ? options.briefEndpointUrl
          : new URL(
              profile.endpointPath,
              providerKey === 'procurement-brief'
                ? options.workflowOrigin ?? 'https://agentic-economy-phi.vercel.app'
                : 'https://agentic-economy-phi.vercel.app',
            ).href,
        credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
        adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        registrationEvidenceRefs: ['seed:production-v2-registration-path'],
      },
    }, 2_200)
    if (binding.kind !== 'registered') throw new Error(`historical workflow binding failed: ${binding.reason}`)
    const admitted = await setCapabilitySupplyEligibilityCommand(db, {
      actor: { kind: 'system', ref: 'system:migration-test' },
      context: {
        operationKey: `test:historical-workflow-admission:${profile.priorBindingId}`,
        correlationId: `test:historical-workflow-supply:${profile.slug}`,
        reasonCode: 'test_historical_workflow_admission',
        evidenceRefs: ['test:historical-workflow-supply'],
      },
      eligibility: {
        offeringId: profile.priorOfferingId,
        bindingId: profile.priorBindingId,
        contractRef: contract.ref,
        decision: 'admit',
        expectedOfferingRegistrationHash: offering.registrationHash,
        expectedBindingRegistrationHash: binding.registrationHash,
        admissionEvidenceRefs: ['test:historical-workflow-supply'],
        conformanceEvidenceRefs: ['test:historical-workflow-supply'],
      },
    }, 2_300)
    if (admitted.kind !== 'eligible') throw new Error(`historical workflow admission failed: ${admitted.kind}`)
  }
}

async function registerHistoricalItineraryBuilderV2Supply(
  db: Parameters<typeof registerCapabilityContractDocument>[0],
): Promise<void> {
  const profile = SANDBOX_WORKFLOW_PROVIDER_PROFILES['itinerary-builder']
  if (profile === undefined) throw new Error('historical itinerary builder profile missing')
  const encoded = encodeCapabilityContractDocument(historicalItineraryBuilderCapabilityContractDocument())
  const contract = await registerCapabilityContractDocument(db, encoded.documentJson, 2_000)
  if (contract.kind !== 'registered') throw new Error(`historical itinerary contract failed: ${contract.reason}`)
  const business = await db.query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', profile.slug)).unique()
  if (business === null) throw new Error('historical itinerary business missing')
  const offering = await registerCapabilityOfferingCommand(db, {
    actor: { kind: 'system', ref: 'system:migration-test' },
    context: {
      operationKey: `test:historical-workflow-offering:${profile.priorOfferingId}`,
      correlationId: `test:historical-workflow-supply:${profile.slug}`,
      reasonCode: 'test_historical_workflow_registration',
      evidenceRefs: ['test:historical-workflow-supply'],
    },
    registration: {
      offeringId: profile.priorOfferingId, businessId: business._id,
      networkId: 'ae:public', contractRef: contract.ref,
      presentation: {
        label: profile.capabilityName,
        summary: `Labelled sandbox ${profile.cohortLabel.toLowerCase()} workflow evidence only.`,
        price: { kind: 'fixed', currency: 'AUD', amountMinor: profile.amountMinor },
        materialTerms: [{
          termId: 'sandbox_only', label: 'Environment',
          value: 'Sandbox only; no real supplier order, payment, or fulfilment.',
        }],
        commercialRelationship: {
          kind: 'none', summary: 'Sandbox verification has no commercial relationship.',
          influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
          evidenceRefs: ['seed:sandbox-commercial-neutrality'],
        },
      },
      searchTerms: [profile.cohortLabel, profile.capabilityName, 'workplace catering supplier recommendation'],
      registrationEvidenceRefs: ['seed:sandbox-labelled-workflow-business'],
    },
  }, 2_100)
  if (offering.kind !== 'registered') throw new Error(`historical itinerary offering failed: ${offering.reason}`)
  const binding = await registerCapabilityBindingCommand(db, {
    actor: { kind: 'system', ref: 'system:migration-test' },
    context: {
      operationKey: `test:historical-workflow-binding:${profile.priorBindingId}`,
      correlationId: `test:historical-workflow-supply:${profile.slug}`,
      reasonCode: 'test_historical_workflow_registration',
      evidenceRefs: ['test:historical-workflow-supply'],
    },
    registration: {
      bindingId: profile.priorBindingId, offeringId: profile.priorOfferingId,
      networkId: 'ae:public', contractRef: contract.ref,
      endpointUrl: new URL(profile.endpointPath, 'https://agentic-economy-phi.vercel.app').href,
      credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
      continuation: { kind: 'single_response', evidenceRefs: ['seed:sandbox-single-response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['seed:sandbox-no-cancellation'] },
      adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
      registrationEvidenceRefs: ['seed:production-v2-registration-path'],
    },
  }, 2_200)
  if (binding.kind !== 'registered') throw new Error(`historical itinerary binding failed: ${binding.reason}`)
  const admitted = await setCapabilitySupplyEligibilityCommand(db, {
    actor: { kind: 'system', ref: 'system:migration-test' },
    context: {
      operationKey: `test:historical-workflow-admission:${profile.priorBindingId}`,
      correlationId: `test:historical-workflow-supply:${profile.slug}`,
      reasonCode: 'test_historical_workflow_admission',
      evidenceRefs: ['test:historical-workflow-supply'],
    },
    eligibility: {
      offeringId: profile.priorOfferingId, bindingId: profile.priorBindingId,
      contractRef: contract.ref, decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['test:historical-workflow-supply'],
      conformanceEvidenceRefs: ['test:historical-workflow-supply'],
    },
  }, 2_300)
  if (admitted.kind !== 'eligible') throw new Error(`historical itinerary admission failed: ${admitted.kind}`)
}

async function readHistoricalRouteV1Retirement(
  backend: ReturnType<typeof convexTest>,
) {
  return readHistoricalRouteRetirement(backend, ':v1')
}

async function readHistoricalRouteRetirement(
  backend: ReturnType<typeof convexTest>,
  bindingSuffix: ':v1' | ':v2' | ':v3' | ':v4' | ':v5',
) {
  return backend.run(async (ctx) => ({
    bindings: (await ctx.db.query('capabilityTransportBindings').collect())
      .filter((binding) => binding.bindingId.startsWith('binding:sandbox-route-') && binding.bindingId.endsWith(bindingSuffix))
      .map(({ bindingId, admission, conformance }) => ({ bindingId, admission, conformance }))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId)),
    operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
      operation.key.startsWith('seed:capability-route-binding-retire:')
    )),
    audits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
      audit.eventType === 'capability_supply.eligibility_changed'
      && audit.idempotencyKey.startsWith('seed:capability-route-binding-retire:')
    )),
  }))
}

async function readHistoricalProcurementV1Retirement(
  backend: ReturnType<typeof convexTest>,
) {
  return backend.run(async (ctx) => ({
    bindings: (await ctx.db.query('capabilityTransportBindings').collect())
      .filter((binding) => (
        (binding.bindingId.startsWith('binding:sandbox-procurement-')
          || binding.bindingId === 'binding:sandbox-supplier-options:http-json:v1')
        && (binding.bindingId.endsWith(':v1')
          || binding.bindingId === 'binding:sandbox-procurement-brief:http-json:v2')
      ))
      .map(({ bindingId, admission, conformance }) => ({ bindingId, admission, conformance }))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId)),
    operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
      operation.key.startsWith('seed:capability-workflow-binding-retire:')
    )),
    audits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
      audit.eventType === 'capability_supply.eligibility_changed'
      && audit.idempotencyKey.startsWith('seed:capability-workflow-binding-retire:')
    )),
  }))
}

async function readHistoricalItineraryBuilderRetirement(
  backend: ReturnType<typeof convexTest>,
) {
  return backend.run(async (ctx) => {
    const bindings = await ctx.db.query('capabilityTransportBindings').collect()
    return {
      bindings: bindings
        .filter((binding) => binding.bindingId === 'binding:sandbox-itinerary-builder:http-json:v2')
        .map(({ bindingId, admission, conformance }) => ({ bindingId, admission, conformance })),
      current: bindings
        .filter((binding) => binding.bindingId === 'binding:sandbox-itinerary-builder:http-json:v3')
        .map(({ bindingId, admission, conformance, version }) => ({ bindingId, admission, conformance, version })),
      operations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key === 'seed:capability-workflow-binding-retire:binding:sandbox-itinerary-builder:http-json:v2'
      )),
    }
  })
}
