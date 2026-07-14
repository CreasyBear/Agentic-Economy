import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxV2SupplyRegistrations,
} from '../../convex/devSeed'
import {
  registerCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import schema from '../../convex/schema'
import { runtimeDb } from '../../convex/source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import { SANDBOX_PROVIDER_PROFILES } from '@/modules/sandbox-supply/public'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('labelled sandbox V2 capability supply', () => {
  it('seeds only the two labelled acceptance businesses through the normal production command planes', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    expect(result).toMatchObject({
      seededSlugs: ['sandbox-option-one', 'sandbox-option-two'],
      sandboxV2Bindings: [
        'binding:sandbox-option-one:http-json:v2',
        'binding:sandbox-option-two:http-json:v2',
      ],
    })
    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    expect(bindings.map((binding) => binding.credentialRef)).toEqual([
      'env:AE_SANDBOX_PROVIDER_KEY',
      'env:AE_SANDBOX_PROVIDER_KEY',
    ])
    const businesses = await backend.run((ctx) => ctx.db.query('businesses').collect())
    expect(businesses.map((business) => business.slug).sort()).toEqual([
      'sandbox-option-one',
      'sandbox-option-two',
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

    expect(result.businessIdsBySlug).toEqual(existing.businessIdsBySlug)
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
      'binding:sandbox-option-one:http-json:v2',
      'binding:sandbox-option-two:http-json:v2',
    ])
  })

  it('publishes and admits two inert businesses through the normal production command planes', async () => {
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
      'binding:sandbox-option-one:http-json:v2',
      'binding:sandbox-option-two:http-json:v2',
    ])
    expect(replay.sandboxV2Bindings).toEqual(first.sandboxV2Bindings)
    expect(ownerAfterReplay).toEqual(ownerBeforeReplay)

    const state = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      supplyOperations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply')
      )).collect(),
      catalogOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.operationName === 'publishBusinessCatalog'
        && (operation.key === 'seed:catalog:sandbox-option-one' || operation.key === 'seed:catalog:sandbox-option-two')
      )),
      claimOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.operationName === 'claimBusiness'
        && (operation.key === 'seed:claim:sandbox-option-one' || operation.key === 'seed:claim:sandbox-option-two')
      )),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(state.contracts).toHaveLength(1)
    expect(state.contracts[0]).toMatchObject({
      capabilityId: 'sandbox.reference.lookup', version: 1, status: 'active',
      contractDigest: expect.stringMatching(/^sha256:/),
    })
    expect(state.offerings).toHaveLength(2)
    expect(state.bindings).toHaveLength(2)
    expect(state.offerings.map((offering) => offering.businessId)).toHaveLength(2)
    expect(new Set(state.offerings.map((offering) => offering.businessId)).size).toBe(2)
    expect(state.offerings.every((offering) => (
      offering.capabilityId === state.contracts[0]?.capabilityId
      && offering.version === state.contracts[0]?.version
      && offering.contractDigest === state.contracts[0]?.contractDigest
      && offering.status === 'active'
    ))).toBe(true)
    expect(state.bindings.every((binding) => (
      binding.capabilityId === state.contracts[0]?.capabilityId
      && binding.version === state.contracts[0]?.version
      && binding.contractDigest === state.contracts[0]?.contractDigest
      && binding.admission === 'admitted'
      && binding.conformance === 'conformant'
      && binding.adapterId === 'http-json:v1'
    ))).toBe(true)
    expect(JSON.stringify({ offerings: state.offerings, bindings: state.bindings })).not.toContain('"operation"')
    expect(state.supplyOperations).toHaveLength(6)
    expect(state.supplyOperations.every((operation) => operation.actorKind === 'system' && operation.status === 'succeeded')).toBe(true)
    expect(state.catalogOperations).toHaveLength(2)
    expect(state.catalogOperations.every((operation) => operation.status === 'succeeded')).toBe(true)
    expect(state.claimOperations).toHaveLength(2)
    expect(state.claimOperations.every((operation) => operation.status === 'succeeded')).toBe(true)
    expect(state.audits.filter((audit) => (
      audit.eventType.startsWith('capability_')
    ))).toHaveLength(8)
    expect(state.audits.filter((audit) => audit.eventType.startsWith('capability_')).every((audit) => (
      audit.actorKind === 'system' && audit.actorRef === 'system:dev-seed'
    ))).toBe(true)
    expect(state.audits.filter((audit) => audit.eventType === 'capability_supply.eligibility_changed')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetType: 'capability_offering', beforeState: 'inactive', afterState: 'active' }),
        expect.objectContaining({ targetType: 'capability_binding', beforeState: 'not_admitted:not_conformant', afterState: 'admitted:conformant' }),
      ]),
    )
    expect(state.audits.filter((audit) => audit.eventType === 'claim.published' && (
      audit.slug === 'sandbox-option-one' || audit.slug === 'sandbox-option-two'
    ))).toHaveLength(2)

    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible).toMatchObject({
      kind: 'available',
      supplies: [
        { binding: { bindingId: 'binding:sandbox-option-one:http-json:v2' } },
        { binding: { bindingId: 'binding:sandbox-option-two:http-json:v2' } },
      ],
    })
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
      'binding:sandbox-option-one:http-json:v2',
      'binding:sandbox-option-two:http-json:v2',
    ])
    const registrations = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(registrations.offerings).toHaveLength(2)
    expect(registrations.bindings).toHaveLength(2)
  })

  it('retires stale sandbox bindings through the eligibility command when corrected bindings are published', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await backend.run(async (ctx) => {
      for (const [profileKey, profile] of Object.entries(SANDBOX_PROVIDER_PROFILES)) {
        const current = await ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v2BindingId))
          .unique()
        const offering = await ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', profile.offeringId))
          .unique()
        if (current === null || offering === null) throw new Error('corrected sandbox supply missing')
        const contractRef = {
          capabilityId: current.capabilityId,
          version: current.version,
          contractDigest: current.contractDigest,
        }
        const registered = await registerCapabilityBindingCommand(ctx.db, {
          actor: { kind: 'system', ref: 'system:migration-test' },
          context: {
            operationKey: `test:legacy-binding:${profile.legacyV2BindingId}`,
            correlationId: `test:legacy-binding:${profile.slug}`,
            reasonCode: 'test_legacy_registration', evidenceRefs: ['test:legacy-binding'],
          },
          registration: {
            bindingId: profile.legacyV2BindingId, offeringId: profile.offeringId,
            networkId: 'ae:public', contractRef,
            endpointUrl: `https://agentic-economy-phi.vercel.app/api/sandbox/capability?profile=${profileKey}`,
            credentialRef: `env:AE_SANDBOX_PROVIDER_${profileKey.toUpperCase()}_KEY`,
            continuation: { kind: 'single_response', evidenceRefs: ['test:legacy-single-response'] },
            cancellation: { kind: 'unsupported', evidenceRefs: ['test:legacy-no-cancellation'] },
            adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
            registrationEvidenceRefs: ['test:legacy-binding'],
          },
        }, 10_000)
        if (registered.kind !== 'registered') throw new Error(`legacy registration failed: ${registered.reason}`)
        const admitted = await setCapabilitySupplyEligibilityCommand(ctx.db, {
          actor: { kind: 'system', ref: 'system:migration-test' },
          context: {
            operationKey: `test:legacy-admission:${profile.legacyV2BindingId}`,
            correlationId: `test:legacy-binding:${profile.slug}`,
            reasonCode: 'test_legacy_admission', evidenceRefs: ['test:legacy-binding'],
          },
          eligibility: {
            offeringId: offering.offeringId, bindingId: registered.bindingId, contractRef,
            decision: 'admit', expectedOfferingRegistrationHash: offering.registrationHash,
            expectedBindingRegistrationHash: registered.registrationHash,
            admissionEvidenceRefs: ['test:legacy-binding'], conformanceEvidenceRefs: ['test:legacy-binding'],
          },
        }, 10_500)
        if (admitted.kind !== 'eligible') throw new Error(`legacy admission failed: ${admitted.kind}`)
      }
    })

    const migrated = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})

    const beforeReplay = await backend.run(async (ctx) => ({
      retirementOperations: (await ctx.db.query('operationKeys').collect()).filter((operation) => (
        operation.key.startsWith('seed:capability-binding-retire:')
      )),
      retirementAudits: (await ctx.db.query('auditEvents').collect()).filter((audit) => (
        audit.targetRef === 'binding:sandbox-option-one:http-json'
        || audit.targetRef === 'binding:sandbox-option-two:http-json'
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
      )),
    }))
    expect(replay).toEqual(migrated)
    expect(afterReplay).toEqual(beforeReplay)

    const bindings = await backend.run((ctx) => ctx.db.query('capabilityTransportBindings').collect())
    const bindingState = (binding: typeof bindings[number]) => ({
      bindingId: binding.bindingId, credentialRef: binding.credentialRef,
      admission: binding.admission, conformance: binding.conformance,
    })
    expect(bindings.filter((binding) => binding.bindingId.endsWith(':v2')).map(bindingState)).toEqual([
      {
        bindingId: 'binding:sandbox-option-one:http-json:v2', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'admitted', conformance: 'conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json:v2', credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
        admission: 'admitted', conformance: 'conformant',
      },
    ])
    expect(bindings.filter((binding) => !binding.bindingId.endsWith(':v2')).map(bindingState)).toEqual([
      {
        bindingId: 'binding:sandbox-option-one:http-json', credentialRef: 'env:AE_SANDBOX_PROVIDER_ONE_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
      {
        bindingId: 'binding:sandbox-option-two:http-json', credentialRef: 'env:AE_SANDBOX_PROVIDER_TWO_KEY',
        admission: 'not_admitted', conformance: 'not_conformant',
      },
    ])
  })

  it('refuses to retire a reserved legacy binding whose registered identity is not the sandbox identity', async () => {
    const backend = convexTest(schema, modules)
    await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {})
    await backend.run(async (ctx) => {
      const profile = SANDBOX_PROVIDER_PROFILES.one
      const current = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', profile.v2BindingId)).unique()
      if (current === null) throw new Error('corrected sandbox binding missing')
      const registered = await registerCapabilityBindingCommand(ctx.db, {
        actor: { kind: 'system', ref: 'system:migration-test' },
        context: {
          operationKey: 'test:legacy-binding:identity-mismatch', correlationId: 'test:legacy-binding:identity-mismatch',
          reasonCode: 'test_legacy_registration', evidenceRefs: ['test:legacy-binding'],
        },
        registration: {
          bindingId: profile.legacyV2BindingId, offeringId: profile.offeringId, networkId: 'ae:public',
          contractRef: {
            capabilityId: current.capabilityId, version: current.version, contractDigest: current.contractDigest,
          },
          endpointUrl: 'https://wrong-provider.example.test/capability',
          credentialRef: 'env:AE_SANDBOX_PROVIDER_ONE_KEY',
          continuation: { kind: 'single_response', evidenceRefs: ['test:legacy-single-response'] },
          cancellation: { kind: 'unsupported', evidenceRefs: ['test:legacy-no-cancellation'] },
          adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
          registrationEvidenceRefs: ['test:legacy-binding'],
        },
      }, 10_000)
      if (registered.kind !== 'registered') throw new Error(`legacy registration failed: ${registered.reason}`)
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
