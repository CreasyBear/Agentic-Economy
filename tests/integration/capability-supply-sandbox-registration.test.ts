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
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('labelled sandbox V2 capability supply', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('registers a new immutable route generation at the configured provider origin', async () => {
    vi.stubEnv('AE_SANDBOX_PROVIDER_ORIGIN', 'https://loyal-peacock-107.convex.site')
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result.sandboxRouteBindings).toEqual([
      'binding:sandbox-route-resolver:http-json:v3',
      'binding:sandbox-route-quoter:http-json:v3',
    ])
    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    expect(bindings.filter(({ bindingId }) => bindingId.startsWith('binding:sandbox-route-')).map((binding) => ({
      bindingId: binding.bindingId, endpointUrl: binding.endpointUrl,
    }))).toEqual([
      {
        bindingId: 'binding:sandbox-route-resolver:http-json:v3',
        endpointUrl: 'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-resolver',
      },
      {
        bindingId: 'binding:sandbox-route-quoter:http-json:v3',
        endpointUrl: 'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-quoter',
      },
    ])
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
        'binding:sandbox-route-resolver:http-json:v3',
        'binding:sandbox-route-quoter:http-json:v3',
      ],
      sandboxRoutePublicationRefs: [
        'offering:sandbox-route-resolver:reference-resolve:v3',
        'offering:sandbox-route-quoter:service-quote:v3',
      ],
    })
    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    expect(bindings.map((binding) => binding.credentialRef)).toEqual([
      'env:AE_SANDBOX_PROVIDER_KEY',
      'env:AE_SANDBOX_PROVIDER_KEY',
      'env:AE_SANDBOX_PROVIDER_KEY',
      'env:AE_SANDBOX_PROVIDER_KEY',
    ])
    expect(bindings.filter(({ bindingId }) => bindingId.startsWith('binding:sandbox-route-')).map((binding) => ({
      bindingId: binding.bindingId, endpointUrl: binding.endpointUrl,
    }))).toEqual([
      {
        bindingId: 'binding:sandbox-route-resolver:http-json:v3',
        endpointUrl: 'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-resolver',
      },
      {
        bindingId: 'binding:sandbox-route-quoter:http-json:v3',
        endpointUrl: 'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-quoter',
      },
    ])
    const businesses = await backend.run((ctx) => ctx.db.query('businesses').collect())
    expect(businesses.map((business) => business.slug).sort()).toEqual([
      'sandbox-option-one',
      'sandbox-option-two',
      'sandbox-route-quoter',
      'sandbox-route-resolver',
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
        publicationRef: 'offering:sandbox-route-resolver:reference-resolve:v3',
        bindingId: 'binding:sandbox-route-resolver:http-json:v3',
        credentialState: 'unobserved', healthState: 'unobserved',
      },
      {
        publicationRef: 'offering:sandbox-route-quoter:service-quote:v3',
        bindingId: 'binding:sandbox-route-quoter:http-json:v3',
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
      'binding:sandbox-route-quoter:http-json:v3',
      'binding:sandbox-route-resolver:http-json:v3',
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
    expect(Object.keys(result.businessIdsBySlug)).toHaveLength(4)
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

  it('publishes and admits four inert businesses through the normal production command planes', async () => {
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
        publicationRef: 'offering:sandbox-route-resolver:reference-resolve:v3',
        bindingId: 'binding:sandbox-route-resolver:http-json:v3',
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      },
      {
        publicationRef: 'offering:sandbox-route-quoter:service-quote:v3',
        bindingId: 'binding:sandbox-route-quoter:http-json:v3',
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
    expect(state.catalogOperations).toHaveLength(4)
    expect(state.catalogOperations.every((operation) => operation.status === 'succeeded')).toBe(true)
    expect(state.claimOperations).toHaveLength(4)
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
    ))).toHaveLength(4)

    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible).toMatchObject({
      kind: 'available',
      supplies: [
        { binding: { bindingId: 'binding:sandbox-option-one:http-json:v4' } },
        { binding: { bindingId: 'binding:sandbox-option-two:http-json:v4' } },
        { binding: { bindingId: 'binding:sandbox-route-quoter:http-json:v3' } },
        { binding: { bindingId: 'binding:sandbox-route-resolver:http-json:v3' } },
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
      'binding:sandbox-route-resolver:http-json:v3',
      'binding:sandbox-route-quoter:http-json:v3',
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
      'binding:sandbox-route-quoter:http-json:v3',
      'binding:sandbox-route-resolver:http-json:v3',
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
    expect(bindings.filter((binding) => binding.bindingId.endsWith(':v4')).map(bindingState)).toEqual([
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
  options: Readonly<{ resolverEndpointUrl?: string; generation?: 'v1' | 'v2' }> = {},
): Promise<void> {
  for (const [routeKey, profile] of Object.entries(SANDBOX_ROUTE_PROVIDER_PROFILES)) {
    const offeringId = options.generation === 'v2' ? profile.priorV2OfferingId : profile.priorOfferingId
    const bindingId = options.generation === 'v2' ? profile.priorV2BindingId : profile.priorBindingId
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

async function readHistoricalRouteV1Retirement(
  backend: ReturnType<typeof convexTest>,
) {
  return readHistoricalRouteRetirement(backend, ':v1')
}

async function readHistoricalRouteRetirement(
  backend: ReturnType<typeof convexTest>,
  bindingSuffix: ':v1' | ':v2',
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
