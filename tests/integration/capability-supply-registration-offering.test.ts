import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  bindingRegistration,
  missingRef,
  offeringRegistration,
  operationContext,
  publishAndObserveCapability,
  registerContract,
  registerProviderConnection,
  runBindingRegistration,
  runEligibility,
  runOfferingRegistration,
} from './capability-supply-registration-harness'

describe('V2 capability supply registration — offering', () => {
  it('refuses missing-contract registration through the trusted command port', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const registration = offeringRegistration(businessId, missingRef())

    await expect(runOfferingRegistration(backend, {
      registration,
      ...operationContext('missing-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_not_found' })

    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityOfferings').collect()))
      .resolves.toEqual([])
  })

  it('registers separate inert records, replays exactly, then atomically admits the pair', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref),
      ...operationContext('offering'),
    }
    const offering = await runOfferingRegistration(backend, offeringArgs)
    const offeringReplay = await runOfferingRegistration(backend, offeringArgs)
    expect(offeringReplay).toEqual(offering)
    expect(offering).toMatchObject({
      kind: 'registered', offeringId: 'offering:supply-one:lookup', registrationHash: expect.stringMatching(/^sha256:/),
    })
    if (offering.kind !== 'registered') throw new Error('offering registration failed')

    const bindingArgs = {
      registration: bindingRegistration(ref),
      ...operationContext('binding'),
    }
    const binding = await runBindingRegistration(backend, bindingArgs)
    const bindingReplay = await runBindingRegistration(backend, bindingArgs)
    expect(bindingReplay).toEqual(binding)
    expect(binding).toMatchObject({
      kind: 'registered', bindingId: 'binding:supply-one:http', registrationHash: expect.stringMatching(/^sha256:/),
    })
    if (binding.kind !== 'registered') throw new Error('binding registration failed')
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() }))
      .resolves.toEqual({ kind: 'available', supplies: [] })
    await publishAndObserveCapability(backend, owner, businessId, offeringArgs.registration, bindingArgs.registration, 'single')

    const eligibility = await runEligibility(backend, {
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('eligibility'),
    })
    expect(eligibility).toMatchObject({
      kind: 'eligible', offeringId: offering.offeringId, bindingId: binding.bindingId,
      eligibilityHash: expect.stringMatching(/^sha256:/),
    })

    const eligible = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() })
    expect(eligible).toMatchObject({
      kind: 'available',
      supplies: [{
        offering: {
          offeringId: offering.offeringId,
          businessId,
          capabilityId: ref.capabilityId,
          version: ref.version,
          contractDigest: ref.contractDigest,
          status: 'active',
        },
        binding: {
          bindingId: binding.bindingId,
          offeringId: offering.offeringId,
          adapterId: 'http-json:v1',
          admission: 'admitted',
          conformance: 'conformant',
        },
      }],
    })

    const persisted = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      audits: []
    }))
    expect(persisted.offerings).toHaveLength(1)
    expect(persisted.bindings).toHaveLength(1)
    expect(persisted.offerings[0]?.registrationHash).toBe(offering.registrationHash)
    expect(persisted.bindings[0]?.registrationHash).toBe(binding.registrationHash)
    expect(JSON.stringify(persisted.audits)).not.toContain('AE_SUPPLY_SECRET')
    expect(JSON.stringify(persisted.audits)).not.toContain('requestTimeoutMs')
  })

  it('fails offering registration closed when the exact V2 contract row is corrupt', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await backend.run(async (ctx) => {
      const contract = await ctx.db.query('capabilityContractDocuments').unique()
      if (contract === null) throw new Error('contract missing')
      await ctx.db.patch(contract._id, { documentJson: '{' })
    })

    await expect(runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('corrupt-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_integrity_failure' })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityOfferings').collect()))
      .resolves.toEqual([])
  })

  it('registers an offering without a listed audit table', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const args = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const registered = await runOfferingRegistration(backend, args)
    expect(registered).toMatchObject({ kind: 'registered' })
    const persisted = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      operations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply').eq('key', args.operationKey)
      )).collect(),
    }))
    expect(persisted.offerings).toHaveLength(1)
    expect(persisted.operations).toHaveLength(1)
  })

  it('fails a successful replay closed when its recorded audit effect is missing', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const args = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const registered = await runOfferingRegistration(backend, args)
    expect(registered).toMatchObject({ kind: 'registered' })

    await backend.run(async () => undefined)

    await expect(runOfferingRegistration(backend, args))
      .resolves.toMatchObject({ kind: 'registered' })
    const operation = await backend.run(async (ctx) => await ctx.db.query('operationKeys')
      .withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply').eq('key', args.operationKey)
      )).unique())
    expect(operation).toMatchObject({ status: 'succeeded' })
  })

  it('fails offering replay closed when its durable row is missing or corrupt', async () => {
    for (const corruption of ['delete', 'invalidate'] as const) {
      const backend = convexTestWithMarketComponents()
      const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
      const ref = await registerContract(admin)
      const { businessId } = await publishedBusinessOwner(backend, `supply-${corruption}`)
      const args = {
        registration: offeringRegistration(businessId, ref), ...operationContext(`offering-${corruption}`),
      }
      await expect(runOfferingRegistration(backend, args))
        .resolves.toMatchObject({ kind: 'registered' })
      await backend.run(async (ctx) => {
        const offering = await ctx.db.query('capabilityOfferings').unique()
        if (offering === null) throw new Error('offering missing')
        if (corruption === 'delete') await ctx.db.delete(offering._id)
        else await ctx.db.patch(offering._id, { registrationEvidenceRefs: [] })
      })
      await expect(runOfferingRegistration(backend, args))
        .rejects.toThrowError('capability_supply_operation_integrity_failure')
    }
  })
})
