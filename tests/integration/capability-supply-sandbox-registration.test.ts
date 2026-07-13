import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]))

describe('labelled sandbox V2 capability supply', () => {
  it('registers two inert businesses through the production V2 offering and binding command plane', async () => {
    const backend = convexTest(schema, modules)
    const first = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    const replay = await backend.mutation(internal.devSeed.seedDevCatalog, {})
    expect(first.sandboxV2Bindings).toEqual([
      'binding:sandbox-option-one:http-json',
      'binding:sandbox-option-two:http-json',
    ])
    expect(replay.sandboxV2Bindings).toEqual(first.sandboxV2Bindings)

    const state = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      operations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply')
      )).collect(),
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
      && offering.status === 'inactive'
    ))).toBe(true)
    expect(state.bindings.every((binding) => (
      binding.capabilityId === state.contracts[0]?.capabilityId
      && binding.version === state.contracts[0]?.version
      && binding.contractDigest === state.contracts[0]?.contractDigest
      && binding.admission === 'not_admitted'
      && binding.conformance === 'not_conformant'
      && binding.adapterId === 'http-json:v1'
    ))).toBe(true)
    expect(JSON.stringify({ offerings: state.offerings, bindings: state.bindings })).not.toContain('"operation"')
    expect(state.operations).toHaveLength(4)
    expect(state.operations.every((operation) => operation.actorKind === 'system' && operation.status === 'succeeded')).toBe(true)
    expect(state.audits.filter((audit) => (
      audit.eventType === 'capability_offering.registered' || audit.eventType === 'capability_binding.registered'
    ))).toHaveLength(4)
    expect(state.audits.filter((audit) => audit.eventType.startsWith('capability_')).every((audit) => (
      audit.actorKind === 'system' && audit.actorRef === 'system:dev-seed'
    ))).toBe(true)

    const eligible = await backend.query(internal.capabilitySupply.listEligible, { networkId: 'ae:public', limit: 32 })
    expect(eligible).toEqual({ kind: 'available', supplies: [] })
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
    expect(eligible.supplies).toEqual([])
    const registrations = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(registrations.offerings).toHaveLength(2)
    expect(registrations.bindings).toHaveLength(2)
  })
})
