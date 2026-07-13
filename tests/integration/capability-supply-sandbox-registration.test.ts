import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import {
  admitSandboxV2Supply,
  registerSandboxBusinesses,
  registerSandboxV2SupplyRegistrations,
} from '../../convex/devSeed'
import schema from '../../convex/schema'
import { runtimeDb } from '../../convex/source_state'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('labelled sandbox V2 capability supply', () => {
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
      'binding:sandbox-option-one:http-json',
      'binding:sandbox-option-two:http-json',
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
      'binding:sandbox-option-one:http-json',
      'binding:sandbox-option-two:http-json',
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
        { binding: { bindingId: 'binding:sandbox-option-one:http-json' } },
        { binding: { bindingId: 'binding:sandbox-option-two:http-json' } },
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
      'binding:sandbox-option-one:http-json',
      'binding:sandbox-option-two:http-json',
    ])
    const registrations = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(registrations.offerings).toHaveLength(2)
    expect(registrations.bindings).toHaveLength(2)
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
