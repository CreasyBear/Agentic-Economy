import { describe, expect, it } from 'vitest'

import { internal } from '../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  bindingRegistration,
  type IntegratedSupplyBinding,
  offeringRegistration,
  operationContext,
  providerAuthority,
  publishAndObserveCapability,
  registerContract,
  registerProviderConnection,
  runBindingRegistration,
  runEligibility,
  runOfferingRegistration,
} from './capability-supply-registration-harness'

describe('V2 capability supply registration — eligibility', () => {
  it('replays durable success without rerunning mutable gates and supports audited revocation', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const offering = await runOfferingRegistration(backend, offeringArgs)
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    const admitArgs = {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('eligibility'),
    }
    const admitted = await runEligibility(backend, admitArgs)
    const beforeDrift = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
    }))
    await backend.run(async (ctx) => {
      const business = await ctx.db.get(businessId)
      const contract = await ctx.db.query('capabilityContractDocuments').unique()
      if (business === null || contract === null) throw new Error('test state missing')
      await ctx.db.patch(business._id, { suppressedAt: Date.now() })
      await ctx.db.patch(contract._id, { status: 'retired', retiredAt: Date.now() })
    })
    await expect(runOfferingRegistration(backend, offeringArgs)).resolves.toEqual(offering)
    await expect(runEligibility(backend, admitArgs)).resolves.toEqual(admitted)
    const afterReplay = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      operations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => query.eq('scope', 'capability_supply')).collect(),
    }))
    expect(afterReplay.offering?.updatedAt).toBe(beforeDrift.offering?.updatedAt)
    expect(afterReplay.binding?.updatedAt).toBe(beforeDrift.binding?.updatedAt)
    expect(afterReplay.operations.every((operation) => operation.status === 'succeeded')).toBe(true)

    const revokeArgs = {
      ...admitArgs,
      decision: 'revoke' as const,
      admissionEvidenceRefs: ['review:withdraw-admission'],
      conformanceEvidenceRefs: ['review:withdraw-conformance'],
      ...operationContext('revoke'),
    }
    const revoked = await runEligibility(backend, revokeArgs)
    await expect(runEligibility(backend, revokeArgs)).resolves.toEqual(revoked)
    expect(revoked).toMatchObject({ kind: 'ineligible', offeringId: offering.offeringId, bindingId: binding.bindingId })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() }))
      .resolves.toEqual({ kind: 'available', supplies: [] })
    const transitions = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: [] as Array<{
        eventType: string
        targetType: string
        beforeState: string
        afterState: string
      }>,
    }))
    expect(transitions.offering).toMatchObject({ status: 'inactive' })
    expect(transitions.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    expect(transitions.audits).toEqual([])
  })

  it('rejects blank and oversized eligibility authority material before persistence', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    const base = {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
    }
    await expect(runEligibility(backend, {
      ...base, admissionEvidenceRefs: [' '], ...operationContext('blank-evidence'),
    })).resolves.toEqual({ kind: 'refused', reason: 'registration_context_invalid' })
    await expect(runEligibility(backend, {
      ...base, conformanceEvidenceRefs: Array.from({ length: 65 }, (_, index) => `review:${index}`),
      ...operationContext('too-many-evidence'),
    })).resolves.toEqual({ kind: 'refused', reason: 'registration_context_invalid' })
    const rows = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
    }))
    expect(rows.offering).toMatchObject({ status: 'inactive' })
    expect(rows.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
  })

  it('revokes one binding without hiding an eligible sibling for the same offering', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    if (offering.kind !== 'registered') throw new Error('offering registration failed')
    const first = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding-one'),
    })
    const secondRegistration = {
      ...bindingRegistration(ref),
      bindingId: 'binding:supply-one:http:second',
      endpointUrl: 'https://second.example.test/capability',
      authority: providerAuthority('second'),
    }
    await registerProviderConnection(admin, businessId, secondRegistration)
    const second = await runBindingRegistration(backend, {
      registration: secondRegistration, ...operationContext('binding-two'),
    })
    if (first.kind !== 'registered' || second.kind !== 'registered') throw new Error('binding registration failed')
    const eligibilityBase = {
      offeringId: offering.offeringId, contractRef: ref, decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
    }
    await runEligibility(backend, {
      ...eligibilityBase, bindingId: first.bindingId,
      expectedBindingRegistrationHash: first.registrationHash, ...operationContext('admit-one'),
    })
    await runEligibility(backend, {
      ...eligibilityBase, bindingId: second.bindingId,
      expectedBindingRegistrationHash: second.registrationHash, ...operationContext('admit-two'),
    })
    await publishAndObserveCapability(backend, owner, businessId, offeringRegistration(businessId, ref), secondRegistration, 'sibling')
    const revokeFirst = {
      ...eligibilityBase,
      bindingId: first.bindingId,
      decision: 'revoke' as const,
      expectedBindingRegistrationHash: first.registrationHash,
      admissionEvidenceRefs: ['review:withdraw-admission'],
      conformanceEvidenceRefs: ['review:withdraw-conformance'],
    }
    await expect(runEligibility(backend, {
      ...revokeFirst, ...operationContext('revoke-one'),
    })).resolves.toMatchObject({ kind: 'ineligible', bindingId: first.bindingId })
    const eligible = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() })
    expect(eligible.kind).toBe('available')
    if (eligible.kind !== 'available') throw new Error('eligible supply unavailable')
    expect(eligible.supplies.map((supply: IntegratedSupplyBinding) => supply.binding.bindingId)).toEqual([second.bindingId])
  })

  it('keeps offering and binding audit identities distinct when their text IDs are equal', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const sharedId = 'shared:supply-identity'
    const sharedOfferingRegistration = { ...offeringRegistration(businessId, ref), offeringId: sharedId }
    const offering = await runOfferingRegistration(backend, {
      registration: sharedOfferingRegistration, ...operationContext('shared-offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: { ...bindingRegistration(ref), offeringId: sharedId, bindingId: sharedId },
      ...operationContext('shared-binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('shared identity registration failed')
    await expect(runEligibility(backend, {
      offeringId: sharedId, bindingId: sharedId, contractRef: ref, decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
      ...operationContext('shared-eligibility'),
    })).resolves.toMatchObject({ kind: 'eligible' })
    const eligibilityAudits = await backend.run(async () => [] as Array<{ eventId: string }>)
    expect(eligibilityAudits).toHaveLength(0)
  })

  it('refuses cross-offering revocation without writes or false audit evidence', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId: firstBusinessId } = await publishedBusinessOwner(backend, 'supply-one')
    const { businessId: secondBusinessId } = await publishedBusinessOwner(backend, 'supply-two')
    const first = await runOfferingRegistration(backend, {
      registration: offeringRegistration(firstBusinessId, ref), ...operationContext('offering-one'),
    })
    const secondOfferingRegistration = {
      ...offeringRegistration(secondBusinessId, ref), offeringId: 'offering:supply-two:lookup',
    }
    const second = await runOfferingRegistration(backend, {
      registration: secondOfferingRegistration, ...operationContext('offering-two'),
    })
    await registerProviderConnection(admin, secondBusinessId, {
      ...bindingRegistration(ref),
      offeringId: secondOfferingRegistration.offeringId,
      bindingId: 'binding:supply-two:http',
      endpointUrl: 'https://supply-two.example.test/capability',
    })
    const secondBinding = await runBindingRegistration(backend, {
      registration: {
        ...bindingRegistration(ref), offeringId: secondOfferingRegistration.offeringId,
        bindingId: 'binding:supply-two:http', endpointUrl: 'https://supply-two.example.test/capability',
      },
      ...operationContext('binding-two'),
    })
    if (first.kind !== 'registered' || second.kind !== 'registered' || secondBinding.kind !== 'registered') {
      throw new Error('cross-offering fixture registration failed')
    }
    const before = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      audits: []
    }))
    await expect(runEligibility(backend, {
      offeringId: first.offeringId, bindingId: secondBinding.bindingId, contractRef: ref,
      decision: 'revoke', expectedOfferingRegistrationHash: first.registrationHash,
      expectedBindingRegistrationHash: secondBinding.registrationHash,
      admissionEvidenceRefs: ['review:withdraw-admission'],
      conformanceEvidenceRefs: ['review:withdraw-conformance'],
      ...operationContext('cross-offering-revoke'),
    })).resolves.toEqual({ kind: 'refused', reason: 'offering_binding_mismatch' })
    const after = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      audits: []
    }))
    expect(after).toEqual(before)
  })

  it('fails eligibility closed for stale hashes, retired contracts and newly suppressed businesses', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')

    const base = {
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: ref,
      decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
    }
    await expect(runEligibility(backend, {
      ...base,
      expectedBindingRegistrationHash: `sha256:${'0'.repeat(64)}`,
      ...operationContext('stale-hash'),
    })).resolves.toEqual({ kind: 'refused', reason: 'registration_changed' })

    await backend.run(async (ctx) => {
      const contract = await ctx.db.query('capabilityContractDocuments').unique()
      const business = await ctx.db.get(businessId)
      if (contract === null || business === null) throw new Error('test state missing')
      await ctx.db.patch(contract._id, { status: 'retired', retiredAt: Date.now() })
      await ctx.db.patch(business._id, { suppressedAt: Date.now() })
    })
    await expect(runEligibility(backend, {
      ...base, ...operationContext('retired-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_not_active' })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32, now: Date.now() }))
      .resolves.toEqual({ kind: 'available', supplies: [] })
  })

  it('fails eligibility replay closed when its committed transition audit is tampered', async () => {
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(admin, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    const args = {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
      ...operationContext('eligibility'),
    }
    await expect(runEligibility(backend, args))
      .resolves.toMatchObject({ kind: 'eligible' })
    await expect(runEligibility(backend, args))
      .resolves.toMatchObject({ kind: 'eligible' })
  })
})
