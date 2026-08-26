import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { capabilityBindingEligibilityHash } from '@/modules/capability-supply/public'
import {
  convexModules as modules,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  bindingRegistration,
  offeringRegistration,
  operationContext,
  registerContract,
  registerProviderConnection,
  runBindingRegistration,
  runEligibility,
  runOfferingRegistration,
  runQuarantine,
} from './capability-supply-registration-harness'

describe('V2 capability supply registration — quarantine', () => {
  it('quarantines the last binding with standard integrity and replays history after re-admission', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(backend, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    const admit = {
      offeringId: offering.offeringId, bindingId: binding.bindingId, contractRef: ref,
      decision: 'admit' as const, expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: ['review:admission'], conformanceEvidenceRefs: ['review:conformance'],
    }
    await runEligibility(backend, { ...admit, ...operationContext('shared-control-key') })
    const control = await admin.query(api.capabilitySupply.inspectBindingControlState, { bindingId: binding.bindingId })
    if (control.kind !== 'available') throw new Error('binding control state unavailable')
    const quarantineArgs = {
      bindingId: binding.bindingId, expectedObservedRowDigest: control.observedRowDigest,
      ...operationContext('shared-control-key'),
    }
    const quarantined = await runQuarantine(backend, quarantineArgs)
    expect(quarantined).toMatchObject({ kind: 'quarantined' })
    if (quarantined.kind !== 'quarantined') throw new Error('quarantine failed')
    const afterQuarantine = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: await ctx.db.query('auditEvents').order('asc').take(20),
    }))
    expect(afterQuarantine.offering).toMatchObject({ status: 'inactive' })
    expect(afterQuarantine.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    expect(afterQuarantine.binding?.eligibilityHash).toBe(capabilityBindingEligibilityHash({
      bindingId: binding.bindingId, registrationHash: binding.registrationHash,
      admission: 'not_admitted', conformance: 'not_conformant',
      admissionEvidenceRefs: quarantineArgs.evidenceRefs,
      conformanceEvidenceRefs: quarantineArgs.evidenceRefs,
    }))
    const quarantineAudits = afterQuarantine.audits.filter((audit) => (
      audit.eventType === 'capability_binding.quarantined'
      || (
        audit.eventType === 'capability_supply.eligibility_changed'
        && audit.targetType === 'capability_offering'
        && audit.targetRef === offering.offeringId
        && audit.afterState === 'inactive'
      )
    ))
    expect(quarantineAudits).toHaveLength(2)
    const bindingQuarantineAudit = quarantineAudits.find((audit) => (
      audit.eventType === 'capability_binding.quarantined'
    ))
    if (bindingQuarantineAudit === undefined) throw new Error('binding quarantine audit missing')
    expect(bindingQuarantineAudit).toMatchObject({
      eventId: expect.stringMatching(/^audit:capability_supply:/u),
      eventType: 'capability_binding.quarantined', actorKind: 'admin',
      actorRef: 'user_capability_supply_admin', targetType: 'capability_binding', targetRef: binding.bindingId,
      beforeState: 'admitted:conformant', afterState: 'not_admitted:not_conformant',
      idempotencyKey: quarantineArgs.operationKey, correlationId: quarantineArgs.correlationId,
      reasonCode: quarantineArgs.reasonCode, evidenceRefs: quarantineArgs.evidenceRefs,
      redactedPayloadJson: expect.any(String), payloadHash: expect.any(String), createdAt: expect.any(Number),
    })
    expect(JSON.parse(bindingQuarantineAudit.redactedPayloadJson)).toMatchObject({
      bindingId: binding.bindingId, observedRowDigest: quarantineArgs.expectedObservedRowDigest,
      eligibilityHash: quarantined.eligibilityHash,
      parent: expect.objectContaining({ kind: 'updated', offeringId: offering.offeringId, status: 'inactive' }),
    })
    const quarantineAuditEventIds = quarantineAudits.map((audit) => audit.eventId)

    await runEligibility(backend, { ...admit, ...operationContext('re-admit') })
    await expect(runQuarantine(backend, quarantineArgs)).resolves.toEqual(quarantined)
    const afterReplay = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: await ctx.db.query('auditEvents').order('asc').take(20),
    }))
    expect(afterReplay.offering).toMatchObject({ status: 'active' })
    expect(afterReplay.binding).toMatchObject({ admission: 'admitted', conformance: 'conformant' })
    expect(afterReplay.audits.filter((audit) => quarantineAuditEventIds.includes(audit.eventId)).map((audit) => audit.eventId).sort())
      .toEqual([...quarantineAuditEventIds].sort())
  })

  it('quarantines a binding without mutating a corrupt parent offering', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_supply_admin')
    const ref = await registerContract(admin)
    const { businessId } = await publishedBusinessOwner(backend, 'supply-one')
    await registerProviderConnection(backend, businessId, bindingRegistration(ref))
    const offering = await runOfferingRegistration(backend, {
      registration: offeringRegistration(businessId, ref), ...operationContext('offering'),
    })
    const binding = await runBindingRegistration(backend, {
      registration: bindingRegistration(ref), ...operationContext('binding'),
    })
    if (offering.kind !== 'registered' || binding.kind !== 'registered') throw new Error('supply registration failed')
    await runEligibility(backend, {
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
    await expect(runQuarantine(backend, {
      bindingId: binding.bindingId, expectedObservedRowDigest: control.observedRowDigest,
      ...operationContext('quarantine-corrupt-parent'),
    })).resolves.toMatchObject({ kind: 'quarantined' })
    const state = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings').unique(),
      binding: await ctx.db.query('capabilityTransportBindings').unique(),
      audits: [] as Array<{ eventType: string; redactedPayloadJson: string }>,
    }))
    expect(state.offering).toMatchObject({ status: 'active', registrationEvidenceRefs: [] })
    expect(state.binding).toMatchObject({ admission: 'not_admitted', conformance: 'not_conformant' })
    expect(state.audits).toEqual([])
  })
})
