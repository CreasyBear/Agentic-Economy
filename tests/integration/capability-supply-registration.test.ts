import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityBindingEligibilityHash,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

import { convexModules as modules, ownerAdmin, publishedBusinessOwner, type ConvexFixtureAdmin, type ConvexFixtureBackend } from '../helpers/convex-fixtures'

describe('V2 capability supply registration', () => {
  it('refuses anonymous and missing-contract registration without a supply write', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const registration = offeringRegistration(businessId, missingRef())

    await expect(backend.mutation(api.capabilitySupply.registerOffering, {
      registration,
      ...operationContext('anonymous'),
    })).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    await expect(admin.mutation(api.capabilitySupply.registerOffering, {
      registration,
      ...operationContext('missing-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_not_found' })

    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityOfferings').collect()))
      .resolves.toEqual([])
  })

  it('registers separate inert records, replays exactly, then atomically admits the pair', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref),
      ...operationContext('offering'),
    }
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, offeringArgs)
    const offeringReplay = await admin.mutation(api.capabilitySupply.registerOffering, offeringArgs)
    expect(offeringReplay).toEqual(offering)
    expect(offering).toMatchObject({
      kind: 'registered', offeringId: 'offering:supply-one:lookup', registrationHash: expect.stringMatching(/^sha256:/),
    })
    if (offering.kind !== 'registered') throw new Error('offering registration failed')

    const bindingArgs = {
      registration: bindingRegistration(ref),
      ...operationContext('binding'),
    }
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, bindingArgs)
    const bindingReplay = await admin.mutation(api.capabilitySupply.registerBinding, bindingArgs)
    expect(bindingReplay).toEqual(binding)
    expect(binding).toMatchObject({
      kind: 'registered', bindingId: 'binding:supply-one:http', registrationHash: expect.stringMatching(/^sha256:/),
    })
    if (binding.kind !== 'registered') throw new Error('binding registration failed')
    await publishAndObserveCapability(backend, owner, businessId, offeringArgs.registration, bindingArgs.registration, 'single')

    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 }))
      .resolves.toEqual({ kind: 'available', supplies: [] })

    const eligibility = await admin.mutation(api.capabilitySupply.setEligibility, {
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

    const eligible = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 })
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
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(persisted.offerings).toHaveLength(1)
    expect(persisted.bindings).toHaveLength(1)
    expect(persisted.offerings[0]?.registrationHash).toBe(offering.registrationHash)
    expect(persisted.bindings[0]?.registrationHash).toBe(binding.registrationHash)
    expect(JSON.stringify(persisted.audits)).not.toContain('AE_SUPPLY_SECRET')
    expect(JSON.stringify(persisted.audits)).not.toContain('requestTimeoutMs')
  })

  it('fails offering registration closed when the exact V2 contract row is corrupt', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await backend.run(async (ctx) => {
      const contract = await ctx.db.query('capabilityContractDocuments').unique()
      if (contract === null) throw new Error('contract missing')
      await ctx.db.patch(contract._id, { documentJson: '{' })
    })

    await expect(admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('corrupt-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_integrity_failure' })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityOfferings').collect()))
      .resolves.toEqual([])
  })

  it('replays durable success without rerunning mutable gates and supports audited revocation', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, offeringArgs)
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
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
    const admitted = await admin.mutation(api.capabilitySupply.setEligibility, admitArgs)
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
    await expect(admin.mutation(api.capabilitySupply.registerOffering, offeringArgs)).resolves.toEqual(offering)
    await expect(admin.mutation(api.capabilitySupply.setEligibility, admitArgs)).resolves.toEqual(admitted)
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
    const revoked = await admin.mutation(api.capabilitySupply.setEligibility, revokeArgs)
    await expect(admin.mutation(api.capabilitySupply.setEligibility, revokeArgs)).resolves.toEqual(revoked)
    expect(revoked).toMatchObject({ kind: 'ineligible', offeringId: offering.offeringId, bindingId: binding.bindingId })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 }))
      .resolves.toEqual({ kind: 'available', supplies: [] })
    const transitions = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(transitions.offering).toMatchObject({ status: 'inactive' })
    expect(transitions.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    expect(transitions.audits.filter((audit) => audit.eventType === 'capability_supply.eligibility_changed'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ targetType: 'capability_offering', beforeState: 'inactive', afterState: 'active' }),
        expect.objectContaining({ targetType: 'capability_binding', beforeState: 'not_admitted:not_conformant', afterState: 'admitted:conformant' }),
        expect.objectContaining({ targetType: 'capability_offering', beforeState: 'active', afterState: 'inactive' }),
        expect.objectContaining({ targetType: 'capability_binding', beforeState: 'admitted:conformant', afterState: 'not_admitted:not_conformant' }),
      ]))
  })

  it('rejects blank and oversized eligibility authority material before persistence', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
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
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
      ...base, admissionEvidenceRefs: [' '], ...operationContext('blank-evidence'),
    })).resolves.toEqual({ kind: 'refused', reason: 'registration_context_invalid' })
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
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
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    if (offering.kind !== 'registered') throw new Error('offering registration failed')
    const first = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: bindingRegistration(ref), ...operationContext('binding-one'),
    })
    const secondRegistration = {
      ...bindingRegistration(ref),
      bindingId: 'binding:supply-one:http:second',
      endpointUrl: 'https://second.example.test/capability',
      credentialRef: 'env:AE_SUPPLY_SECOND_SECRET',
    }
    const second = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: secondRegistration, ...operationContext('binding-two'),
    })
    if (first.kind !== 'registered' || second.kind !== 'registered') throw new Error('binding registration failed')
    const eligibilityBase = {
      offeringId: offering.offeringId, contractRef: ref, decision: 'admit' as const,
      expectedOfferingRegistrationHash: offering.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
    }
    await admin.mutation(api.capabilitySupply.setEligibility, {
      ...eligibilityBase, bindingId: first.bindingId,
      expectedBindingRegistrationHash: first.registrationHash, ...operationContext('admit-one'),
    })
    await admin.mutation(api.capabilitySupply.setEligibility, {
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
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
      ...revokeFirst, ...operationContext('revoke-one'),
    })).resolves.toMatchObject({ kind: 'ineligible', bindingId: first.bindingId })
    const eligible = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 })
    expect(eligible.kind).toBe('available')
    if (eligible.kind !== 'available') throw new Error('eligible supply unavailable')
    expect(eligible.supplies.map((supply) => supply.binding.bindingId)).toEqual([second.bindingId])
  })

  it('keeps offering and binding audit identities distinct when their text IDs are equal', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const sharedId = 'shared:supply-identity'
    const sharedOfferingRegistration = { ...offeringRegistration(businessId, ref), offeringId: sharedId }
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: sharedOfferingRegistration, ...operationContext('shared-offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: { ...bindingRegistration(ref), offeringId: sharedId, bindingId: sharedId },
      ...operationContext('shared-binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('shared identity registration failed')
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
      offeringId: sharedId, bindingId: sharedId, contractRef: ref, decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
      ...operationContext('shared-eligibility'),
    })).resolves.toMatchObject({ kind: 'eligible' })
    const audits = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
    const eligibilityAudits = audits.filter((audit) => audit.eventType === 'capability_supply.eligibility_changed')
    expect(eligibilityAudits).toHaveLength(2)
    expect(new Set(eligibilityAudits.map((audit) => audit.eventId)).size).toBe(2)
  })

  it('refuses cross-offering revocation without writes or false audit evidence', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId: firstBusinessId } = await publishedBusinessOwner(backend, 'supply-one')
    const { businessId: secondBusinessId } = await publishedBusinessOwner(backend, 'supply-two')
    const first = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(firstBusinessId, ref), ...operationContext('offering-one'),
    })
    const secondOfferingRegistration = {
      ...offeringRegistration(secondBusinessId, ref), offeringId: 'offering:supply-two:lookup',
    }
    const second = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: secondOfferingRegistration, ...operationContext('offering-two'),
    })
    const secondBinding = await admin.mutation(api.capabilitySupply.registerBinding, {
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
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
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
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(after).toEqual(before)
  })

  it('fails eligibility closed for stale hashes, retired contracts and newly suppressed businesses', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
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
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
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
    await expect(admin.mutation(api.capabilitySupply.setEligibility, {
      ...base, ...operationContext('retired-contract'),
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_not_active' })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 }))
      .resolves.toEqual({ kind: 'available', supplies: [] })
  })

  it('refuses adapter, exact-ref, identity and stored-integrity drift without a V1 fallback', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'supply-one')
    const offeringArgs = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    await expect(admin.mutation(api.capabilitySupply.registerOffering, {
      ...offeringArgs,
      registration: { ...offeringArgs.registration, operation: 'quote' },
    } as never)).rejects.toThrowError(/extra field|unexpected field/i)
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, offeringArgs)
    if (offering.kind !== 'registered') throw new Error('offering registration failed')

    await expect(admin.mutation(api.capabilitySupply.registerOffering, {
      ...offeringArgs,
      registration: {
        ...offeringArgs.registration,
        presentation: { ...offeringArgs.registration.presentation, summary: 'Changed under the same key.' },
      },
    })).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    await expect(admin.mutation(api.capabilitySupply.registerBinding, {
      registration: {
        ...bindingRegistration(ref),
        adapter: {
          adapterId: 'not-registered:v1',
          config: {},
        },
      },
      ...operationContext('unknown-adapter'),
    })).resolves.toEqual({ kind: 'refused', reason: 'adapter_not_registered' })

    await expect(admin.mutation(api.capabilitySupply.registerBinding, {
      registration: {
        ...bindingRegistration(ref),
        adapter: {
          adapterId: 'http-json:v1',
          config: { method: 'POST' as const, requestTimeoutMs: 5_000, vertical: 'shipping' },
        },
      },
      ...operationContext('invalid-config'),
    })).resolves.toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })

    await expect(admin.mutation(api.capabilitySupply.registerBinding, {
      registration: {
        ...bindingRegistration(ref),
        contractRef: { ...ref, contractDigest: `sha256:${'f'.repeat(64)}` },
      },
      ...operationContext('digest-mismatch'),
    })).resolves.toEqual({ kind: 'refused', reason: 'offering_binding_mismatch' })

    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (binding.kind !== 'registered') throw new Error('binding registration failed')
    const healthyBinding = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: {
        ...bindingRegistration(ref), bindingId: 'binding:supply-one:http:healthy',
        endpointUrl: 'https://healthy.example.test/capability', credentialRef: 'env:AE_SUPPLY_HEALTHY_SECRET',
      },
      ...operationContext('healthy-binding'),
    })
    if (healthyBinding.kind !== 'registered') throw new Error('healthy binding registration failed')
    await admin.mutation(api.capabilitySupply.setEligibility, {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('eligibility'),
    })
    await admin.mutation(api.capabilitySupply.setEligibility, {
      offeringId: offering.offeringId, bindingId: healthyBinding.bindingId, contractRef: ref,
      decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: healthyBinding.registrationHash,
      admissionEvidenceRefs: ['review:business-and-contract'],
      conformanceEvidenceRefs: ['review:http-adapter-contract'],
      ...operationContext('healthy-eligibility'),
    })
    await publishAndObserveCapability(backend, owner, businessId, offeringArgs.registration, {
      ...bindingRegistration(ref),
      bindingId: healthyBinding.bindingId,
      endpointUrl: 'https://healthy.example.test/capability',
      credentialRef: 'env:AE_SUPPLY_HEALTHY_SECRET',
    }, 'healthy')
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', binding.bindingId)).unique()
      if (row === null) throw new Error('binding missing')
      await ctx.db.patch(row._id, { registrationHash: 'corrupt' })
    })
    await expect(backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 }))
      .resolves.toEqual({ kind: 'unavailable', reason: 'supply_integrity_failure' })
    const controlState = await admin.query(api.capabilitySupply.inspectBindingControlState, {
      bindingId: binding.bindingId,
    })
    if (controlState.kind !== 'available') throw new Error('binding control state unavailable')
    await expect(admin.mutation(api.capabilitySupply.quarantineBinding, {
      bindingId: binding.bindingId, expectedObservedRowDigest: controlState.observedRowDigest,
      ...operationContext('quarantine-corrupt-binding'),
    })).resolves.toMatchObject({ kind: 'quarantined', bindingId: binding.bindingId })
    const recovered = await backend.query(internal.capabilitySupply.listIntegrated, { networkId: 'ae:public', limit: 32 })
    expect(recovered).toMatchObject({
      kind: 'available', supplies: [{ binding: { bindingId: healthyBinding.bindingId } }],
    })
    const legacy = await backend.run(async (ctx) => await ctx.db.query('routingKernelBindings').collect())
    expect(legacy).toEqual([])
  })

  it('rolls back the offering and operation when its deterministic audit slot is forged', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const args = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const eventId = `audit:capability_supply:${canonicalDigest({
      action: 'register_offering',
      eventType: 'capability_offering.registered',
      targetType: 'capability_offering',
      targetRef: args.registration.offeringId,
      actorKind: 'admin',
      actorRef: 'user_capability_supply_admin',
      operationKey: args.operationKey,
    })}`
    await backend.run(async (ctx) => {
      await ctx.db.insert('auditEvents', {
        eventId, eventType: 'capability_offering.registered', actorKind: 'admin', actorRef: 'forged_admin',
        targetType: 'capability_offering', targetRef: 'forged_offering',
        beforeState: 'absent', afterState: 'active', idempotencyKey: 'forged_operation',
        correlationId: 'forged_correlation', reasonCode: 'forged_reason', evidenceRefs: ['forged:evidence'],
        redactedPayloadJson: '{}', payloadHash: `sha256:${'0'.repeat(64)}`, createdAt: 1,
      })
    })

    await expect(admin.mutation(api.capabilitySupply.registerOffering, args))
      .rejects.toThrowError('capability_supply_audit_integrity_failure')
    const persisted = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      operations: await ctx.db.query('operationKeys').withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply').eq('key', args.operationKey)
      )).collect(),
    }))
    expect(persisted).toEqual({ offerings: [], operations: [] })
  })

  it('quarantines the last binding with standard integrity and replays history after re-admission', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    const admit = {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit' as const, expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
    }
    await admin.mutation(api.capabilitySupply.setEligibility, { ...admit, ...operationContext('shared-control-key') })
    const control = await admin.query(api.capabilitySupply.inspectBindingControlState, { bindingId: binding.bindingId })
    if (control.kind !== 'available') throw new Error('binding control state unavailable')
    const quarantineArgs = {
      bindingId: binding.bindingId, expectedObservedRowDigest: control.observedRowDigest,
      ...operationContext('shared-control-key'),
    }
    const quarantined = await admin.mutation(api.capabilitySupply.quarantineBinding, quarantineArgs)
    expect(quarantined).toMatchObject({ kind: 'quarantined' })
    const afterQuarantine = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
    }))
    expect(afterQuarantine.offering).toMatchObject({ status: 'inactive' })
    expect(afterQuarantine.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    expect(afterQuarantine.binding?.eligibilityHash).toBe(capabilityBindingEligibilityHash({
      bindingId: binding.bindingId, registrationHash: binding.registrationHash,
      admission: 'not_admitted', conformance: 'not_conformant',
      admissionEvidenceRefs: quarantineArgs.evidenceRefs,
      conformanceEvidenceRefs: quarantineArgs.evidenceRefs,
    }))

    await admin.mutation(api.capabilitySupply.setEligibility, { ...admit, ...operationContext('re-admit') })
    await expect(admin.mutation(api.capabilitySupply.quarantineBinding, quarantineArgs)).resolves.toEqual(quarantined)
    const afterReplay = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
    }))
    expect(afterReplay.offering).toMatchObject({ status: 'active' })
    expect(afterReplay.binding).toMatchObject({ admission: 'admitted', conformance: 'conformant' })
  })

  it('fails a successful replay closed when its recorded audit effect is missing', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const args = {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    }
    const registered = await admin.mutation(api.capabilitySupply.registerOffering, args)
    expect(registered).toMatchObject({ kind: 'registered' })

    await backend.run(async (ctx) => {
      const operation = await ctx.db.query('operationKeys')
        .withIndex('by_scope_key', (query) => (
          query.eq('scope', 'capability_supply').eq('key', args.operationKey)
      )).unique()
      if (operation === null || operation.effectRefs.length !== 1) throw new Error('operation effect missing')
      const [effectEventId, effectDigest] = operation.effectRefs[0]!.split('#')
      if (effectEventId === undefined || effectDigest === undefined || !effectDigest.startsWith('sha256:')) {
        throw new Error('operation effect is not a resolvable integrity reference')
      }
      const audits = await ctx.db.query('auditEvents').collect()
      const audit = audits.find((event) => (
        event.eventId === effectEventId
        && event.eventType === 'capability_offering.registered'
        && event.targetRef === args.registration.offeringId
      ))
      if (audit === undefined) throw new Error('audit missing')
      await ctx.db.delete(audit._id)
    })

    await expect(admin.mutation(api.capabilitySupply.registerOffering, args))
      .rejects.toThrowError('capability_supply_operation_integrity_failure')
    const operation = await backend.run(async (ctx) => await ctx.db.query('operationKeys')
      .withIndex('by_scope_key', (query) => (
        query.eq('scope', 'capability_supply').eq('key', args.operationKey)
      )).unique())
    expect(operation).toMatchObject({ status: 'succeeded' })
  })

  it('quarantines a binding without mutating a corrupt parent offering', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    await admin.mutation(api.capabilitySupply.setEligibility, {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref, decision: 'admit',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
      ...operationContext('admit'),
    })
    await backend.run(async (ctx) => {
      const parent = await ctx.db.query('capabilityOfferings').unique()
      if (parent === null) throw new Error('offering missing')
      await ctx.db.patch(parent._id, { registrationEvidenceRefs: [] })
    })
    const control = await admin.query(api.capabilitySupply.inspectBindingControlState, { bindingId: binding.bindingId })
    if (control.kind !== 'available') throw new Error('binding control state unavailable')
    await expect(admin.mutation(api.capabilitySupply.quarantineBinding, {
      bindingId: binding.bindingId, expectedObservedRowDigest: control.observedRowDigest,
      ...operationContext('quarantine-corrupt-parent'),
    })).resolves.toMatchObject({ kind: 'quarantined' })
    const state = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(state.offering).toMatchObject({ status: 'active', registrationEvidenceRefs: [] })
    expect(state.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    const quarantineAudit = state.audits.find((audit) => audit.eventType === 'capability_binding.quarantined')
    expect(quarantineAudit?.redactedPayloadJson).toContain('"kind":"unresolved"')
  })

  it('fails offering replay closed when its durable row is missing or corrupt', async () => {
    for (const corruption of ['delete', 'invalidate'] as const) {
      const backend = convexTest(schema, modules)
      const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
      const ref = await registerContract(admin)
      const { businessId } = await publishedBusinessOwner(backend, `supply-${corruption}`)
      const args = {
        registration: offeringRegistration(businessId, ref), ...operationContext(`offering-${corruption}`),
      }
      await expect(admin.mutation(api.capabilitySupply.registerOffering, args))
        .resolves.toMatchObject({ kind: 'registered' })
      await backend.run(async (ctx) => {
        const offering = await ctx.db.query('capabilityOfferings').unique()
        if (offering === null) throw new Error('offering missing')
        if (corruption === 'delete') await ctx.db.delete(offering._id)
        else await ctx.db.patch(offering._id, { registrationEvidenceRefs: [] })
      })
      await expect(admin.mutation(api.capabilitySupply.registerOffering, args))
        .rejects.toThrowError('capability_supply_operation_integrity_failure')
    }
  })

  it('fails eligibility replay closed when its committed transition audit is tampered', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    const offering = await admin.mutation(api.capabilitySupply.registerOffering, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await admin.mutation(api.capabilitySupply.registerBinding, {
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
    await expect(admin.mutation(api.capabilitySupply.setEligibility, args))
      .resolves.toMatchObject({ kind: 'eligible' })
    await backend.run(async (ctx) => {
      const audits = await ctx.db.query('auditEvents').collect()
      const eligibilityAudit = audits.find((event) => (
        event.eventType === 'capability_supply.eligibility_changed'
        && event.targetType === 'capability_offering'
        && event.targetRef === offering.offeringId
      ))
      if (eligibilityAudit === undefined) throw new Error('eligibility audit missing')
      await ctx.db.patch(eligibilityAudit._id, { beforeState: 'active', createdAt: eligibilityAudit.createdAt + 1 })
    })
    await expect(admin.mutation(api.capabilitySupply.setEligibility, args))
      .rejects.toThrowError('capability_supply_operation_integrity_failure')
  })
})

function missingRef() {
  return { capabilityId: 'reference.lookup', version: 1, contractDigest: `sha256:${'0'.repeat(64)}` }
}

function offeringRegistration(businessId: Id<'businesses'>, contractRef: ReturnType<typeof missingRef>) {
  return {
    offeringId: 'offering:supply-one:lookup', businessId, networkId: 'ae:public', contractRef,
    presentation: {
      label: 'Reference lookup', summary: 'A registered capability offering.',
      price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
      materialTerms: [{ termId: 'delivery', label: 'Delivery', value: 'One structured response' }],
      commercialRelationship: {
        kind: 'none' as const, summary: 'No commercial influence.',
        influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['business:no-commercial-influence'],
      },
    },
    searchTerms: ['reference', 'lookup'], registrationEvidenceRefs: ['business:published-registration'],
  } satisfies CapabilityOfferingRegistration
}

function bindingRegistration(contractRef: ReturnType<typeof missingRef>) {
  return {
    bindingId: 'binding:supply-one:http', offeringId: 'offering:supply-one:lookup', networkId: 'ae:public', contractRef,
    endpointUrl: 'https://example.test/capability', credentialRef: 'env:AE_SUPPLY_SECRET',
    continuation: { kind: 'single_response' as const, evidenceRefs: ['adapter:single-response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['adapter:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['adapter:production-registration'],
  } satisfies CapabilityTransportBindingRegistration
}

async function publishAndObserveCapability(
  backend: ConvexFixtureBackend,
  owner: ConvexFixtureAdmin,
  businessId: Id<'businesses'>,
  offering: ReturnType<typeof offeringRegistration>,
  binding: ReturnType<typeof bindingRegistration>,
  suffix: string,
) {
  const published = await owner.mutation(api.capabilitySupply.publishCapability, {
    businessId,
    source: { kind: 'ae_envelope', documentJson: JSON.stringify(capabilityContractV2()) },
    offering: {
      offeringId: offering.offeringId,
      networkId: offering.networkId,
      presentation: offering.presentation,
      searchTerms: offering.searchTerms,
      registrationEvidenceRefs: offering.registrationEvidenceRefs,
    },
    binding: {
      bindingId: binding.bindingId,
      endpointUrl: binding.endpointUrl,
      credentialRef: binding.credentialRef,
      continuation: binding.continuation,
      cancellation: binding.cancellation,
      adapter: binding.adapter,
      registrationEvidenceRefs: binding.registrationEvidenceRefs,
    },
    ...operationContext(`publication:${suffix}`),
  })
  if (published.kind !== 'published') throw new Error(`publication failed: ${published.reason}`)
  await backend.finishInProgressScheduledFunctions()
  const publications = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityPublications').collect()
  ))
  for (const publication of publications) {
    await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      evidenceRefs: ['test:capability-supply-readiness'],
      operationKey: `readiness:${publication.publicationRef}`,
      correlationId: `readiness:${publication.publicationRef}`,
      reasonCode: 'source_test_readiness',
      validUntil: Date.now() + 3_600_000,
    })
  }
  if (publications.length === 0) throw new Error('publication readiness missing')
  return published
}


function operationContext(suffix: string) {
  return {
    operationKey: `op:capability-supply:${suffix}`,
    correlationId: `corr:capability-supply:${suffix}`,
    reasonCode: 'source_test_registration',
    evidenceRefs: ['test:capability-supply'],
  }
}


async function registerContract(admin: ConvexFixtureAdmin) {
  const result = await admin.mutation(api.capabilityContractDocuments.register, {
    documentJson: JSON.stringify(capabilityContractV2()),
    operationKey: 'op:contract:supply', correlationId: 'corr:contract:supply',
    reasonCode: 'source_test_registration', evidenceRefs: ['test:capability-supply'],
  })
  if (result.kind !== 'registered') throw new Error(`contract registration failed: ${result.reason}`)
  return result.ref
}
