import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  capabilitySupplyEligibilityHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  admitRegisteredTransport,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { Doc, Id } from './_generated/dataModel'
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'

const MAX_ELIGIBLE_SUPPLY = 256
const MAX_CONTEXT_VALUE_LENGTH = 200
const MAX_EVIDENCE_REF_LENGTH = 500
const contractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})
const evidenceRefsValue = v.array(v.string())
const commercialRelationshipValue = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(),
  influencesEligibility: v.boolean(),
  influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(),
  evidenceRefs: evidenceRefsValue,
})
const priceValue = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({
    kind: v.literal('range'), currency: v.string(),
    minimumAmountMinor: v.number(), maximumAmountMinor: v.number(),
  }),
  v.object({ kind: v.literal('on_request') }),
)
const presentationValue = v.object({
  label: v.string(),
  summary: v.string(),
  price: priceValue,
  materialTerms: v.array(v.object({ termId: v.string(), label: v.string(), value: v.string() })),
  commercialRelationship: commercialRelationshipValue,
})
const offeringRegistrationValue = v.object({
  offeringId: v.string(),
  businessId: v.id('businesses'),
  networkId: v.string(),
  contractRef: contractRefValue,
  presentation: presentationValue,
  searchTerms: v.array(v.string()),
  registrationEvidenceRefs: evidenceRefsValue,
})
const continuationValue = v.object({
  kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const cancellationValue = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const bindingRegistrationValue = v.object({
  bindingId: v.string(),
  offeringId: v.string(),
  networkId: v.string(),
  contractRef: contractRefValue,
  endpointUrl: v.string(),
  credentialRef: v.string(),
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: v.object({ adapterId: v.string(), config: v.any() }), // runtime-validated adapter config boundary
  registrationEvidenceRefs: evidenceRefsValue,
})
const contextFields = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: evidenceRefsValue,
}
const offeringFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('offering_invalid'), v.literal('business_not_registered'),
  v.literal('contract_not_found'), v.literal('contract_not_active'), v.literal('contract_integrity_failure'),
  v.literal('offering_identity_conflict'), v.literal('offering_integrity_failure'),
  v.literal('operation_key_conflict'),
)
const bindingFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('binding_invalid'), v.literal('offering_not_found'), v.literal('business_not_registered'),
  v.literal('offering_binding_mismatch'), v.literal('contract_not_found'), v.literal('contract_not_active'),
  v.literal('contract_integrity_failure'), v.literal('adapter_not_registered'),
  v.literal('adapter_config_invalid'), v.literal('adapter_config_too_large'),
  v.literal('binding_identity_conflict'), v.literal('offering_integrity_failure'),
  v.literal('binding_integrity_failure'), v.literal('operation_key_conflict'),
)
const eligibilityFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('offering_not_found'), v.literal('binding_not_found'), v.literal('business_not_registered'),
  v.literal('offering_binding_mismatch'), v.literal('registration_changed'),
  v.literal('contract_not_found'), v.literal('contract_not_active'), v.literal('contract_integrity_failure'),
  v.literal('offering_integrity_failure'), v.literal('binding_integrity_failure'),
  v.literal('operation_key_conflict'),
)
const registerOfferingResultValue = v.union(
  v.object({
    kind: v.literal('registered'), offeringId: v.string(), registrationHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: offeringFailureReason }),
)
const registerBindingResultValue = v.union(
  v.object({
    kind: v.literal('registered'), bindingId: v.string(), registrationHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: bindingFailureReason }),
)
const eligibilityResultValue = v.union(
  v.object({
    kind: v.union(v.literal('eligible'), v.literal('ineligible')),
    offeringId: v.string(), bindingId: v.string(), eligibilityHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: eligibilityFailureReason }),
)
const quarantineResultValue = v.union(
  v.object({ kind: v.literal('quarantined'), bindingId: v.string(), eligibilityHash: v.string() }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'), v.literal('registration_context_invalid'),
      v.literal('binding_not_found'), v.literal('observed_row_changed'), v.literal('operation_key_conflict'),
    ),
  }),
)
const bindingControlStateValue = v.union(
  v.object({
    kind: v.literal('available'), bindingId: v.string(), observedRowDigest: v.string(),
    admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
    conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
  }),
  v.object({ kind: v.literal('unavailable'), reason: v.literal('binding_not_found') }),
  v.object({ kind: v.literal('refused'), reason: v.literal('authorization_denied') }),
)
const eligibleSupplyValue = v.object({
  offering: v.object({
    offeringId: v.string(), businessId: v.id('businesses'), networkId: v.string(),
    capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
    presentation: presentationValue, status: v.literal('active'), registrationHash: v.string(),
  }),
  binding: v.object({
    bindingId: v.string(), offeringId: v.string(), networkId: v.string(),
    capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
    endpointUrl: v.string(), credentialRef: v.string(), continuation: continuationValue,
    cancellation: cancellationValue, adapterId: v.string(), configJson: v.string(), configDigest: v.string(),
    admission: v.literal('admitted'), conformance: v.literal('conformant'), registrationHash: v.string(),
  }),
})

type RegistrationContext = Readonly<{
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>
type ContractRef = Infer<typeof contractRefValue>
type SupplyCommandActor = Readonly<{ kind: 'admin' | 'system'; ref: string }>
type SupplyAuditInput = Readonly<{
  eventType: 'capability_offering.registered' | 'capability_binding.registered' | 'capability_supply.eligibility_changed'
    | 'capability_binding.quarantined'
  action: 'register_offering' | 'register_binding' | 'set_eligibility' | 'quarantine_binding'
  targetType: 'capability_offering' | 'capability_binding'
  targetRef: string
  actor: SupplyCommandActor
  context: RegistrationContext
  payload: StableHashValue
  beforeState: string
  afterState: string
  createdAt: number
}>
type EligibilityInput = Readonly<{
  offeringId: string
  bindingId: string
  contractRef: ContractRef
  decision: 'admit' | 'revoke'
  expectedOfferingRegistrationHash: string
  expectedBindingRegistrationHash: string
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
}>

export const registerOffering = mutation({
  args: { registration: offeringRegistrationValue, ...contextFields },
  returns: registerOfferingResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityOfferingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      registration: args.registration,
      context: args,
    }, Date.now())
  },
})

export const registerBinding = mutation({
  args: { registration: bindingRegistrationValue, ...contextFields },
  returns: registerBindingResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      registration: args.registration,
      context: args,
    }, Date.now())
  },
})

export const setEligibility = mutation({
  args: {
    offeringId: v.string(), bindingId: v.string(), contractRef: contractRefValue,
    decision: v.union(v.literal('admit'), v.literal('revoke')),
    expectedOfferingRegistrationHash: v.string(), expectedBindingRegistrationHash: v.string(),
    admissionEvidenceRefs: evidenceRefsValue, conformanceEvidenceRefs: evidenceRefsValue,
    ...contextFields,
  },
  returns: eligibilityResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      eligibility: args,
      context: args,
    }, Date.now())
  },
})

export const inspectBindingControlState = query({
  args: { bindingId: v.string() },
  returns: bindingControlStateValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) => index.eq('bindingId', args.bindingId)).unique()
    if (binding === null) return { kind: 'unavailable' as const, reason: 'binding_not_found' as const }
    return {
      kind: 'available' as const, bindingId: binding.bindingId,
      observedRowDigest: bindingObservedRowDigest(binding),
      admission: binding.admission, conformance: binding.conformance,
    }
  },
})

export const quarantineBinding = mutation({
  args: { bindingId: v.string(), expectedObservedRowDigest: v.string(), ...contextFields },
  returns: quarantineResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await quarantineCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      bindingId: args.bindingId, expectedObservedRowDigest: args.expectedObservedRowDigest,
      context: args,
    }, Date.now())
  },
})

export const listEligible = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('available'), supplies: v.array(eligibleSupplyValue) }),
    v.object({
      kind: v.literal('unavailable'),
      reason: v.union(
        v.literal('limit_invalid'), v.literal('eligible_supply_limit_exceeded'),
        v.literal('supply_integrity_failure'), v.literal('contract_integrity_failure'),
      ),
    }),
  ),
  handler: async (ctx, args) => await listEligibleCapabilitySupply(ctx.db, args),
})

export async function registerCapabilityOfferingCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; registration: unknown; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const expectedResult = {
    kind: 'registered' as const,
    offeringId: registration.offeringId,
    registrationHash: capabilityOfferingRegistrationHash(registration),
  }
  const audit = {
    eventType: 'capability_offering.registered' as const,
    action: 'register_offering' as const,
    targetType: 'capability_offering' as const,
    targetRef: expectedResult.offeringId,
    actor: command.actor,
    context: command.context,
    payload: { offeringId: expectedResult.offeringId, registrationHash: expectedResult.registrationHash },
    beforeState: 'absent',
    afterState: 'inactive',
    createdAt: now,
  }
  const operation = await beginOperation(
    db, command.actor, 'registerCapabilityOffering', command.context, { registration }, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    await verifyReplayAudits(db, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return await recoverOfferingReplay(db, registration, operation)
  }
  const result = await registerCapabilityOffering(db, registration, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(db, audit)
  await succeedOperation(db, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; registration: unknown; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const operation = await beginOperation(db, command.actor, 'registerCapabilityTransportBinding', command.context, {
    registration,
  }, now)
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const recovered = await recoverBindingReplay(db, registration, operation)
    const audit = bindingRegistrationAudit(command.actor, command.context, registration.offeringId, recovered, now)
    await verifyReplayAudits(db, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return recovered
  }
  const admitted = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admitted.kind === 'refused') {
    await failOperation(db, operation.operationId, admitted.reason, now)
    return admitted
  }
  const expectedResult = {
    kind: 'registered' as const,
    bindingId: registration.bindingId,
    registrationHash: capabilityBindingRegistrationHash(registration, admitted.transport),
  }
  const result = await registerCapabilityTransportBinding(db, registration, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(db, bindingRegistrationAudit(
    command.actor, command.context, registration.offeringId, expectedResult, now,
  ))
  await succeedOperation(db, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context) || !validEligibilityInput(command.eligibility)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(
    db, command.actor, 'setCapabilitySupplyEligibility', command.context,
    command.eligibility as StableHashValue, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const desired = await recoverEligibilityReplayDesired(db, operation, command)
    const expectedResult = eligibilityPublicResult(command.eligibility, desired)
    await verifyReplayAudits(db, operation, eligibilityReplayAudits(command, desired, now))
    return replayOperationResult(operation, expectedResult)
  }
  const result = await setCapabilitySupplyEligibility(db, command.eligibility, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const desired = desiredEligibility(command.eligibility.decision, result.transition.offeringAfter)
  const expectedResult = eligibilityPublicResult(command.eligibility, desired)
  const offeringAuditId = await ensureSupplyAudit(db, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: result.offeringId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      registrationHash: command.eligibility.expectedOfferingRegistrationHash,
      eligibilityHash: result.offeringEligibilityHash,
    },
    beforeState: result.transition.offeringBefore,
    afterState: result.transition.offeringAfter,
    createdAt: now,
  })
  const bindingAuditId = await ensureSupplyAudit(db, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_binding',
    action: 'set_eligibility',
    targetRef: result.bindingId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      bindingId: result.bindingId,
      registrationHash: command.eligibility.expectedBindingRegistrationHash,
      eligibilityHash: result.bindingEligibilityHash,
    },
    beforeState: result.transition.bindingBefore,
    afterState: result.transition.bindingAfter,
    createdAt: now,
  })
  await succeedOperation(db, operation.operationId, expectedResult, [offeringAuditId, bindingAuditId], now)
  return expectedResult
}

export async function quarantineCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  if (
    !validCommandEnvelope(command.actor, command.context)
    || !boundedTrimmed(command.bindingId, MAX_CONTEXT_VALUE_LENGTH)
    || !isCanonicalDigest(command.expectedObservedRowDigest)
  ) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(db, command.actor, 'quarantineCapabilityBinding', command.context, {
    bindingId: command.bindingId, expectedObservedRowDigest: command.expectedObservedRowDigest,
  }, now)
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') return await replayQuarantineBinding(db, operation, command, now)
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (index) => index.eq('bindingId', command.bindingId)).unique()
  if (binding === null) {
    if (operation.kind === 'ready') await failOperation(db, operation.operationId, 'binding_not_found', now)
    return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  }
  if (bindingObservedRowDigest(binding) !== command.expectedObservedRowDigest) {
    await failOperation(db, operation.operationId, 'observed_row_changed', now)
    return { kind: 'refused' as const, reason: 'observed_row_changed' as const }
  }
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: command.context.evidenceRefs,
    conformanceEvidenceRefs: command.context.evidenceRefs,
  })
  const parent = await trustedQuarantineParent(db, binding)
  let parentAuditId: string | undefined
  let parentDisposition: QuarantineParentDisposition = { kind: 'unresolved' }
  if (parent !== null) {
    const siblings = await db.query('capabilityTransportBindings')
      .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
        index.eq('offeringId', parent.offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
      )).take(2)
    const status = siblings.some((candidate) => candidate.bindingId !== binding.bindingId) ? 'active' : 'inactive'
    const parentEligibilityHash = capabilityOfferingEligibilityHash({
      offeringId: parent.offeringId, registrationHash: parent.registrationHash,
      status, admissionEvidenceRefs: command.context.evidenceRefs,
    })
    await db.patch(parent._id, {
      status, admissionEvidenceRefs: [...command.context.evidenceRefs],
      eligibilityHash: parentEligibilityHash, updatedAt: now,
    })
    parentDisposition = {
      kind: 'updated', offeringId: parent.offeringId, status,
      registrationHash: parent.registrationHash, eligibilityHash: parentEligibilityHash,
    }
    parentAuditId = await ensureSupplyAudit(db, quarantineParentAudit(
      command, parent, parentDisposition, now,
    ))
  }
  await db.patch(binding._id, {
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: [...command.context.evidenceRefs],
    conformanceEvidenceRefs: [...command.context.evidenceRefs], eligibilityHash, updatedAt: now,
  })
  const result = { kind: 'quarantined' as const, bindingId: binding.bindingId, eligibilityHash }
  const auditId = await ensureSupplyAudit(db, quarantineBindingAudit(
    command, binding, eligibilityHash, parentDisposition, now,
  ))
  await succeedOperation(db, operation.operationId, result, [auditId, ...(parentAuditId === undefined ? [] : [parentAuditId])], now)
  return result
}

export async function registerCapabilityOffering(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const business = await publishedBusiness(db, registration.businessId)
  if (business === null) return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  const contract = await resolveExactContract(db, registration.contractRef)
  if (contract.kind === 'refused') return contract
  const registrationHash = capabilityOfferingRegistrationHash(registration)
  const existing = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (existing !== null) {
    if (!offeringIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
  }
  const status = 'inactive' as const
  const admissionEvidenceRefs: string[] = []
  const eligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: registration.offeringId, registrationHash, status, admissionEvidenceRefs,
  })
  await db.insert('capabilityOfferings', {
    offeringId: registration.offeringId,
    businessId: business._id,
    networkId: registration.networkId,
    ...registration.contractRef,
    presentation: writablePresentation(registration.presentation),
    searchTerms: [...registration.searchTerms],
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: true }
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  if (!offeringIntegrityIsValid(offering)) {
    return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
  }
  if (
    offering.networkId !== registration.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), registration.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (await publishedBusiness(db, offering.businessId) === null) {
    return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  }
  const contract = await resolveExactContract(db, registration.contractRef)
  if (contract.kind === 'refused') return contract
  const admission = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admission.kind === 'refused') return admission
  const registrationHash = capabilityBindingRegistrationHash(registration, admission.transport)
  const existing = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', registration.bindingId)).unique()
  if (existing !== null) {
    if (!bindingIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
  }
  const initialAdmission = 'not_admitted' as const
  const conformance = 'not_conformant' as const
  const admissionEvidenceRefs: string[] = []
  const conformanceEvidenceRefs: string[] = []
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: registration.bindingId, registrationHash, admission: initialAdmission, conformance,
    admissionEvidenceRefs, conformanceEvidenceRefs,
  })
  await db.insert('capabilityTransportBindings', {
    bindingId: registration.bindingId,
    offeringId: registration.offeringId,
    networkId: registration.networkId,
    ...registration.contractRef,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: { ...registration.continuation, evidenceRefs: [...registration.continuation.evidenceRefs] },
    cancellation: { ...registration.cancellation, evidenceRefs: [...registration.cancellation.evidenceRefs] },
    adapterId: admission.transport.adapterId,
    configJson: admission.transport.configJson,
    configDigest: admission.transport.configDigest,
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    admission: initialAdmission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: true }
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  if (!validEligibilityInput(input)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', input.offeringId)).unique()
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique()
  if (binding === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  if (
    offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
  ) {
    return { kind: 'refused' as const, reason: 'registration_changed' as const }
  }
  if (
    binding.offeringId !== offering.offeringId
    || binding.networkId !== offering.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (input.decision === 'admit') {
    if (!offeringIntegrityIsValid(offering)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    if (!bindingIntegrityIsValid(binding)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    const contract = await resolveExactContract(db, input.contractRef)
    if (contract.kind === 'refused') return contract
    if (await publishedBusiness(db, offering.businessId) === null) {
      return { kind: 'refused' as const, reason: 'business_not_registered' as const }
    }
  }
  const eligibleSiblings = input.decision === 'revoke'
    ? await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (query) => (
          query.eq('offeringId', offering.offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        ))
        .take(2)
    : []
  const hasOtherEligibleBinding = eligibleSiblings.some((candidate) => candidate.bindingId !== binding.bindingId)
  const desired = desiredEligibility(input.decision, hasOtherEligibleBinding ? 'active' : 'inactive')
  const offeringEligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: offering.offeringId, registrationHash: offering.registrationHash,
    status: desired.offeringStatus, admissionEvidenceRefs: input.admissionEvidenceRefs,
  })
  const bindingEligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: input.admissionEvidenceRefs,
    conformanceEvidenceRefs: input.conformanceEvidenceRefs,
  })
  await db.patch(offering._id, {
    status: desired.offeringStatus, admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    eligibilityHash: offeringEligibilityHash, updatedAt,
  })
  await db.patch(binding._id, {
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    conformanceEvidenceRefs: [...input.conformanceEvidenceRefs],
    eligibilityHash: bindingEligibilityHash, updatedAt,
  })
  return {
    kind: input.decision === 'admit' ? 'eligible' as const : 'ineligible' as const,
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    eligibilityHash: capabilitySupplyEligibilityHash({
      offeringId: offering.offeringId, bindingId: binding.bindingId,
      offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
      offeringStatus: desired.offeringStatus,
      bindingAdmission: desired.bindingAdmission,
      bindingConformance: desired.bindingConformance,
      admissionEvidenceRefs: input.admissionEvidenceRefs,
      conformanceEvidenceRefs: input.conformanceEvidenceRefs,
    }),
    offeringEligibilityHash,
    bindingEligibilityHash,
    transition: {
      offeringBefore: offering.status,
      offeringAfter: desired.offeringStatus,
      bindingBefore: `${binding.admission}:${binding.conformance}`,
      bindingAfter: `${desired.bindingAdmission}:${desired.bindingConformance}`,
    },
  }
}

export async function listEligibleCapabilitySupply(
  db: QueryCtx['db'], input: Readonly<{ networkId: string; limit: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const bindings = await db.query('capabilityTransportBindings')
    .withIndex('by_networkId_admission_conformance', (query) => (
      query.eq('networkId', input.networkId).eq('admission', 'admitted').eq('conformance', 'conformant')
    ))
    .take(input.limit + 1)
  if (bindings.length > input.limit) {
    return { kind: 'unavailable' as const, reason: 'eligible_supply_limit_exceeded' as const }
  }
  const supplies: Array<{
    offering: ReturnType<typeof eligibleOfferingProjection>
    binding: ReturnType<typeof eligibleBindingProjection>
  }> = []
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', binding.offeringId)).unique()
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    if (
      offering.networkId !== binding.networkId
      || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    ) continue
    if (await publishedBusiness(db, offering.businessId) === null) continue
    const contract = await getActiveExactCapabilityContract(db, contractRefFromRow(binding))
    if (contract.kind === 'unavailable') {
      if (contract.reason === 'integrity_failure') {
        return { kind: 'unavailable' as const, reason: 'contract_integrity_failure' as const }
      }
      continue
    }
    supplies.push({ offering: eligibleOfferingProjection(offering), binding: eligibleBindingProjection(binding) })
  }
  return { kind: 'available' as const, supplies }
}

export async function getEligibleExactCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{
    networkId: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: ContractRef
    expectedOfferingRegistrationHash: string
    expectedBindingRegistrationHash: string
  }>,
) {
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', input.offeringId)).unique()
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique()
  if (offering === null || binding === null
    || String(offering.businessId) !== input.businessId
    || offering.networkId !== input.networkId || binding.networkId !== input.networkId
    || binding.offeringId !== offering.offeringId
    || offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
    || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
    || !sameCapabilityContractRef(contractRefFromRow(binding), input.contractRef)
    || !offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)
    || !bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
    return { kind: 'unavailable' as const }
  }
  const business = await publishedBusiness(db, offering.businessId)
  if (business === null) return { kind: 'unavailable' as const }
  const contract = await getActiveExactCapabilityContract(db, input.contractRef)
  if (contract.kind !== 'found') return { kind: 'unavailable' as const }
  return { kind: 'available' as const, offering, binding, business, contract }
}

async function recoverBindingReplay(
  db: QueryCtx['db'], registration: CapabilityTransportBindingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', registration.bindingId)).unique()
  if (binding === null || !bindingIntegrityIsValid(binding)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    bindingId: binding.bindingId,
    registrationHash: binding.registrationHash,
  })
}

async function recoverOfferingReplay(
  db: QueryCtx['db'], registration: CapabilityOfferingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (offering === null || !offeringIntegrityIsValid(offering)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    offeringId: offering.offeringId,
    registrationHash: offering.registrationHash,
  })
}

function offeringIntegrityIsValid(row: Doc<'capabilityOfferings'>): boolean {
  try {
    return capabilityOfferingRegistrationHash(offeringRegistrationFromRow(row)) === row.registrationHash
  } catch {
    return false
  }
}

function bindingIntegrityIsValid(row: Doc<'capabilityTransportBindings'>): boolean {
  try {
    return capabilityBindingRegistrationHash(bindingRegistrationFromRow(row), {
      configJson: row.configJson, configDigest: row.configDigest,
    }) === row.registrationHash
  } catch {
    return false
  }
}

function offeringEligibilityIsValid(row: Doc<'capabilityOfferings'>): boolean {
  return capabilityOfferingEligibilityHash({
    offeringId: row.offeringId, registrationHash: row.registrationHash,
    status: row.status, admissionEvidenceRefs: row.admissionEvidenceRefs,
  }) === row.eligibilityHash
}

function bindingEligibilityIsValid(row: Doc<'capabilityTransportBindings'>): boolean {
  return capabilityBindingEligibilityHash({
    bindingId: row.bindingId, registrationHash: row.registrationHash,
    admission: row.admission, conformance: row.conformance,
    admissionEvidenceRefs: row.admissionEvidenceRefs,
    conformanceEvidenceRefs: row.conformanceEvidenceRefs,
  }) === row.eligibilityHash
}

function offeringRegistrationFromRow(row: Doc<'capabilityOfferings'>): CapabilityOfferingRegistration {
  return defineCapabilityOfferingRegistration({
    offeringId: row.offeringId, businessId: row.businessId, networkId: row.networkId,
    contractRef: contractRefFromRow(row), presentation: row.presentation,
    searchTerms: row.searchTerms, registrationEvidenceRefs: row.registrationEvidenceRefs,
  })
}

function bindingRegistrationFromRow(row: Doc<'capabilityTransportBindings'>): CapabilityTransportBindingRegistration {
  return defineCapabilityTransportBindingRegistration({
    bindingId: row.bindingId, offeringId: row.offeringId, networkId: row.networkId,
    contractRef: contractRefFromRow(row), endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
    continuation: row.continuation, cancellation: row.cancellation,
    adapter: { adapterId: row.adapterId, config: null },
    registrationEvidenceRefs: row.registrationEvidenceRefs,
  })
}

function contractRefFromRow(row: Readonly<{ capabilityId: string; version: number; contractDigest: string }>) {
  return { capabilityId: row.capabilityId, version: row.version, contractDigest: row.contractDigest }
}

async function publishedBusiness(db: QueryCtx['db'], businessId: string | Id<'businesses'>) {
  const business = await db.get(businessId as Id<'businesses'>)
  return business !== null
    && business.publicStatus === 'published'
    && business.claimStatus === 'published'
    && business.suppressedAt === undefined
    ? business
    : null
}

async function resolveExactContract(db: QueryCtx['db'], ref: ContractRef) {
  const result = await getActiveExactCapabilityContract(db, ref)
  if (result.kind === 'found') return result
  return {
    kind: 'refused' as const,
    reason: result.reason === 'not_found'
      ? 'contract_not_found' as const
      : result.reason === 'not_active'
        ? 'contract_not_active' as const
        : 'contract_integrity_failure' as const,
  }
}

function transportAdmissionInput(registration: CapabilityTransportBindingRegistration) {
  return {
    adapterId: registration.adapter.adapterId,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: registration.continuation,
    cancellation: registration.cancellation,
    config: registration.adapter.config,
  }
}

function writablePresentation(presentation: CapabilityOfferingRegistration['presentation']) {
  return {
    ...presentation,
    materialTerms: presentation.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...presentation.commercialRelationship,
      evidenceRefs: [...presentation.commercialRelationship.evidenceRefs],
    },
  }
}

function eligibleOfferingProjection(row: Doc<'capabilityOfferings'>) {
  return {
    offeringId: row.offeringId, businessId: row.businessId, networkId: row.networkId,
    ...contractRefFromRow(row), presentation: row.presentation, status: 'active' as const,
    registrationHash: row.registrationHash,
  }
}

function eligibleBindingProjection(row: Doc<'capabilityTransportBindings'>) {
  return {
    bindingId: row.bindingId, offeringId: row.offeringId, networkId: row.networkId,
    ...contractRefFromRow(row), endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
    continuation: row.continuation, cancellation: row.cancellation,
    adapterId: row.adapterId, configJson: row.configJson, configDigest: row.configDigest,
    admission: 'admitted' as const, conformance: 'conformant' as const,
    registrationHash: row.registrationHash,
  }
}

function validRegistrationContext(input: RegistrationContext): boolean {
  return boundedTrimmed(input.operationKey, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.correlationId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.reasonCode, MAX_CONTEXT_VALUE_LENGTH)
    && validEvidenceRefs(input.evidenceRefs)
}

function validCommandEnvelope(actor: SupplyCommandActor, context: RegistrationContext): boolean {
  return boundedTrimmed(actor.ref, MAX_CONTEXT_VALUE_LENGTH) && validRegistrationContext(context)
}

function validEligibilityInput(input: EligibilityInput): boolean {
  return boundedTrimmed(input.offeringId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.bindingId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.contractRef.capabilityId, MAX_CONTEXT_VALUE_LENGTH)
    && Number.isSafeInteger(input.contractRef.version)
    && input.contractRef.version > 0
    && isCanonicalDigest(input.contractRef.contractDigest)
    && isCanonicalDigest(input.expectedOfferingRegistrationHash)
    && isCanonicalDigest(input.expectedBindingRegistrationHash)
    && validEvidenceRefs(input.admissionEvidenceRefs)
    && validEvidenceRefs(input.conformanceEvidenceRefs)
}

function validEvidenceRefs(references: readonly string[]): boolean {
  return references.length > 0
    && references.length <= 64
    && references.every((reference) => boundedTrimmed(reference, MAX_EVIDENCE_REF_LENGTH))
}

function boundedTrimmed(value: string, maximumLength: number): boolean {
  return value.length > 0 && value.length <= maximumLength && value === value.trim()
}

type DesiredEligibility = Readonly<{
  offeringStatus: 'active' | 'inactive'
  bindingAdmission: 'admitted' | 'not_admitted'
  bindingConformance: 'conformant' | 'not_conformant'
}>

function desiredEligibility(
  decision: 'admit' | 'revoke', remainingOfferingStatus: 'active' | 'inactive',
): DesiredEligibility {
  return decision === 'admit'
    ? {
        offeringStatus: 'active' as const,
        bindingAdmission: 'admitted' as const,
        bindingConformance: 'conformant' as const,
      }
    : {
        offeringStatus: remainingOfferingStatus,
        bindingAdmission: 'not_admitted' as const,
        bindingConformance: 'not_conformant' as const,
      }
}

function eligibilityPublicResult(input: EligibilityInput, desired: DesiredEligibility) {
  return {
    kind: input.decision === 'admit' ? 'eligible' as const : 'ineligible' as const,
    offeringId: input.offeringId,
    bindingId: input.bindingId,
    eligibilityHash: capabilitySupplyEligibilityHash({
      offeringId: input.offeringId,
      bindingId: input.bindingId,
      offeringRegistrationHash: input.expectedOfferingRegistrationHash,
      bindingRegistrationHash: input.expectedBindingRegistrationHash,
      offeringStatus: desired.offeringStatus,
      bindingAdmission: desired.bindingAdmission,
      bindingConformance: desired.bindingConformance,
      admissionEvidenceRefs: input.admissionEvidenceRefs,
      conformanceEvidenceRefs: input.conformanceEvidenceRefs,
    }),
  }
}

async function beginOperation(
  db: MutationCtx['db'], actor: SupplyCommandActor, operationName: string,
  context: RegistrationContext, requestMaterial: StableHashValue, now: number,
) {
  const requestHash = canonicalDigest({
    requestMaterial, correlationId: context.correlationId,
    reasonCode: context.reasonCode, evidenceRefs: context.evidenceRefs,
  })
  const existing = await db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => (
      query.eq('actorRef', actor.ref).eq('operationName', operationName).eq('key', context.operationKey)
    )).unique()
  if (existing !== null) {
    if (existing.requestHash !== requestHash || existing.status === 'in_progress') return { kind: 'conflict' as const }
    if (existing.status === 'succeeded') {
      return { kind: 'replay' as const, resultHash: existing.resultHash, effectRefs: existing.effectRefs }
    }
    if (existing.status === 'failed_terminal') {
      await db.patch(existing._id, { status: 'in_progress', updatedAt: now })
    }
    return { kind: 'ready' as const, operationId: existing._id }
  }
  const operationId = await db.insert('operationKeys', {
    scope: 'capability_supply', actorKind: actor.kind, actorRef: actor.ref, operationName,
    key: context.operationKey, requestHash, status: 'in_progress', effectRefs: [],
    createdAt: now, updatedAt: now,
  })
  return { kind: 'ready' as const, operationId }
}

function replayOperationResult<T extends StableHashValue>(
  replay: Readonly<{ resultHash: string | undefined }>, expected: T,
): T {
  if (replay.resultHash !== canonicalDigest(expected)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return expected
}

async function failOperation(
  db: MutationCtx['db'], operationId: Id<'operationKeys'>, reason: string, now: number,
) {
  await db.patch(operationId, {
    status: 'failed_terminal', resultHash: canonicalDigest({ reason }), updatedAt: now,
  })
}

async function succeedOperation(
  db: MutationCtx['db'], operationId: Id<'operationKeys'>,
  result: StableHashValue, effectRefs: readonly string[], now: number,
) {
  await db.patch(operationId, {
    status: 'succeeded', resultHash: canonicalDigest(result), effectRefs: [...effectRefs], updatedAt: now,
  })
}

function bindingRegistrationAudit(
  actor: SupplyCommandActor,
  context: RegistrationContext,
  offeringId: string,
  result: Readonly<{ bindingId: string; registrationHash: string }>,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_binding.registered',
    action: 'register_binding',
    targetType: 'capability_binding',
    targetRef: result.bindingId,
    actor,
    context,
    payload: { bindingId: result.bindingId, offeringId, registrationHash: result.registrationHash },
    beforeState: 'absent',
    afterState: 'not_admitted',
    createdAt,
  }
}

function bindingObservedRowDigest(binding: Doc<'capabilityTransportBindings'>): string {
  return canonicalDigest({
    _id: binding._id,
    _creationTime: binding._creationTime,
    bindingId: binding.bindingId,
    offeringId: binding.offeringId,
    networkId: binding.networkId,
    capabilityId: binding.capabilityId,
    version: binding.version,
    contractDigest: binding.contractDigest,
    endpointUrl: binding.endpointUrl,
    credentialRef: binding.credentialRef,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    adapterId: binding.adapterId,
    configJson: binding.configJson,
    configDigest: binding.configDigest,
    registrationEvidenceRefs: binding.registrationEvidenceRefs,
    registrationHash: binding.registrationHash,
    admission: binding.admission,
    conformance: binding.conformance,
    admissionEvidenceRefs: binding.admissionEvidenceRefs,
    conformanceEvidenceRefs: binding.conformanceEvidenceRefs,
    eligibilityHash: binding.eligibilityHash,
    registeredAt: binding.registeredAt,
    updatedAt: binding.updatedAt,
  })
}

type QuarantineParentDisposition =
  | Readonly<{ kind: 'unresolved' }>
  | Readonly<{
      kind: 'updated'
      offeringId: string
      status: 'active' | 'inactive'
      registrationHash: string
      eligibilityHash: string
    }>

async function trustedQuarantineParent(
  db: QueryCtx['db'], binding: Doc<'capabilityTransportBindings'>,
): Promise<Doc<'capabilityOfferings'> | null> {
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', binding.offeringId)).unique()
  if (
    offering === null
    || !offeringIntegrityIsValid(offering)
    || offering.networkId !== binding.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
  ) return null
  return offering
}

function quarantineBindingAudit(
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  binding: Doc<'capabilityTransportBindings'>,
  eligibilityHash: string,
  parent: QuarantineParentDisposition,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
    action: 'quarantine_binding',
    targetRef: binding.bindingId, actor: command.actor, context: command.context,
    payload: {
      bindingId: binding.bindingId, observedRowDigest: command.expectedObservedRowDigest, eligibilityHash, parent,
    },
    beforeState: `${binding.admission}:${binding.conformance}`,
    afterState: 'not_admitted:not_conformant', createdAt,
  }
}

function quarantineParentAudit(
  command: Readonly<{ actor: SupplyCommandActor; context: RegistrationContext }>,
  offering: Doc<'capabilityOfferings'>,
  parent: Extract<QuarantineParentDisposition, { kind: 'updated' }>,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'quarantine_binding',
    targetRef: offering.offeringId, actor: command.actor, context: command.context,
    payload: {
      offeringId: offering.offeringId, registrationHash: parent.registrationHash,
      eligibilityHash: parent.eligibilityHash,
    },
    beforeState: offering.status, afterState: parent.status, createdAt,
  }
}

async function replayQuarantineBinding(
  db: QueryCtx['db'],
  replay: Readonly<{ resultHash: string | undefined; effectRefs: readonly string[] }>,
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  const eventId = supplyAuditEventId({
    eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
    action: 'quarantine_binding',
    targetRef: command.bindingId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const stored = await db.query('auditEvents').withIndex('by_eventId', (index) => index.eq('eventId', eventId)).unique()
  if (stored === null) throw new Error('capability_supply_operation_integrity_failure')
  let payload: unknown
  try {
    payload = JSON.parse(stored.redactedPayloadJson ?? '')
  } catch {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (!validQuarantineAuditPayload(payload, command)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  const result = { kind: 'quarantined' as const, bindingId: command.bindingId, eligibilityHash: payload.eligibilityHash }
  const expectations: Array<Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>> = [{
    audit: {
      eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
      action: 'quarantine_binding',
      targetRef: command.bindingId, actor: command.actor, context: command.context,
      payload: {
        bindingId: payload.bindingId,
        observedRowDigest: payload.observedRowDigest,
        eligibilityHash: payload.eligibilityHash,
        parent: payload.parent,
      }, beforeState: '',
      afterState: 'not_admitted:not_conformant', createdAt: now,
    },
    allowedBeforeStates: [
      'admitted:conformant', 'admitted:not_conformant', 'not_admitted:conformant', 'not_admitted:not_conformant',
    ],
  }]
  if (payload.parent.kind === 'updated') {
    expectations.push({
      audit: {
        eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
        action: 'quarantine_binding',
        targetRef: payload.parent.offeringId, actor: command.actor, context: command.context,
        payload: {
          offeringId: payload.parent.offeringId, registrationHash: payload.parent.registrationHash,
          eligibilityHash: payload.parent.eligibilityHash,
        },
        beforeState: '', afterState: payload.parent.status, createdAt: now,
      },
      allowedBeforeStates: ['active', 'inactive'],
    })
  }
  await verifyReplayAudits(db, replay, expectations)
  return replayOperationResult(replay, result)
}

function validQuarantineAuditPayload(
  payload: unknown,
  command: Readonly<{ bindingId: string; expectedObservedRowDigest: string }>,
): payload is {
  bindingId: string
  observedRowDigest: string
  eligibilityHash: string
  parent: QuarantineParentDisposition
} {
  if (typeof payload !== 'object' || payload === null) return false
  const value = payload as Record<string, unknown>
  if (
    value.bindingId !== command.bindingId
    || value.observedRowDigest !== command.expectedObservedRowDigest
    || typeof value.eligibilityHash !== 'string'
    || !isCanonicalDigest(value.eligibilityHash)
    || typeof value.parent !== 'object'
    || value.parent === null
  ) return false
  const parent = value.parent as Record<string, unknown>
  return parent.kind === 'unresolved' || (
    parent.kind === 'updated'
    && typeof parent.offeringId === 'string'
    && (parent.status === 'active' || parent.status === 'inactive')
    && typeof parent.registrationHash === 'string'
    && typeof parent.eligibilityHash === 'string'
    && isCanonicalDigest(parent.eligibilityHash)
  )
}

async function recoverEligibilityReplayDesired(
  db: QueryCtx['db'],
  replay: Readonly<{ effectRefs: readonly string[] }>,
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
): Promise<DesiredEligibility> {
  if (replay.effectRefs.length !== 2) throw new Error('capability_supply_operation_integrity_failure')
  const eventId = supplyAuditEventId({
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: command.eligibility.offeringId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const audit = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (audit === null || (audit.afterState !== 'active' && audit.afterState !== 'inactive')) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (command.eligibility.decision === 'admit' && audit.afterState !== 'active') {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return desiredEligibility(command.eligibility.decision, audit.afterState)
}

function eligibilityReplayAudits(
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  desired: DesiredEligibility,
  createdAt: number,
): readonly Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>[] {
  const offeringEligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: command.eligibility.offeringId,
    registrationHash: command.eligibility.expectedOfferingRegistrationHash,
    status: desired.offeringStatus,
    admissionEvidenceRefs: command.eligibility.admissionEvidenceRefs,
  })
  const bindingEligibilityHash = capabilityBindingEligibilityHash({
    bindingId: command.eligibility.bindingId,
    registrationHash: command.eligibility.expectedBindingRegistrationHash,
    admission: desired.bindingAdmission,
    conformance: desired.bindingConformance,
    admissionEvidenceRefs: command.eligibility.admissionEvidenceRefs,
    conformanceEvidenceRefs: command.eligibility.conformanceEvidenceRefs,
  })
  return [
    {
      audit: {
        eventType: 'capability_supply.eligibility_changed' as const,
        action: 'set_eligibility' as const,
        targetType: 'capability_offering' as const,
        targetRef: command.eligibility.offeringId,
        actor: command.actor,
        context: command.context,
        payload: {
          offeringId: command.eligibility.offeringId,
          registrationHash: command.eligibility.expectedOfferingRegistrationHash,
          eligibilityHash: offeringEligibilityHash,
        },
        beforeState: '',
        afterState: desired.offeringStatus,
        createdAt,
      },
      allowedBeforeStates: ['inactive', 'active'],
    },
    {
      audit: {
        eventType: 'capability_supply.eligibility_changed' as const,
        action: 'set_eligibility' as const,
        targetType: 'capability_binding' as const,
        targetRef: command.eligibility.bindingId,
        actor: command.actor,
        context: command.context,
        payload: {
          offeringId: command.eligibility.offeringId,
          bindingId: command.eligibility.bindingId,
          registrationHash: command.eligibility.expectedBindingRegistrationHash,
          eligibilityHash: bindingEligibilityHash,
        },
        beforeState: '',
        afterState: `${desired.bindingAdmission}:${desired.bindingConformance}`,
        createdAt,
      },
      allowedBeforeStates: ['not_admitted:not_conformant', 'admitted:conformant'],
    },
  ]
}

async function verifyReplayAudits(
  db: QueryCtx['db'],
  replay: Readonly<{ effectRefs: readonly string[] }>,
  expectations: readonly Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>[],
): Promise<void> {
  if (replay.effectRefs.length !== expectations.length) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  for (const [index, expectation] of expectations.entries()) {
    const eventId = supplyAuditEventId(expectation.audit)
    const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
    if (
      existing === null
      || replay.effectRefs[index] !== storedSupplyAuditEffectRef(existing)
      || !storedAuditMatches(existing, expectation.audit, expectation.allowedBeforeStates)
    ) {
      throw new Error('capability_supply_operation_integrity_failure')
    }
  }
}

async function ensureSupplyAudit(
  db: MutationCtx['db'],
  input: SupplyAuditInput,
): Promise<string> {
  const eventId = supplyAuditEventId(input)
  const redactedPayloadJson = stableStringify(input.payload)
  const payloadHash = canonicalDigest(input.payload)
  const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (existing !== null) {
    if (!storedAuditMatches(existing, input, [input.beforeState])) {
      throw new Error('capability_supply_audit_integrity_failure')
    }
    return storedSupplyAuditEffectRef(existing)
  }
  await db.insert('auditEvents', {
    eventId, eventType: input.eventType, actorKind: input.actor.kind, actorRef: input.actor.ref,
    targetType: input.targetType, targetRef: input.targetRef,
    beforeState: input.beforeState, afterState: input.afterState,
    idempotencyKey: input.context.operationKey, correlationId: input.context.correlationId,
    reasonCode: input.context.reasonCode, evidenceRefs: [...input.context.evidenceRefs],
    redactedPayloadJson, payloadHash, createdAt: input.createdAt,
  })
  return supplyAuditEffectRef(input)
}

function supplyAuditEffectRef(input: SupplyAuditInput): string {
  return `${supplyAuditEventId(input)}#${canonicalDigest({
    eventId: supplyAuditEventId(input), eventType: input.eventType,
    actorKind: input.actor.kind, actorRef: input.actor.ref,
    targetType: input.targetType, targetRef: input.targetRef,
    beforeState: input.beforeState, afterState: input.afterState,
    idempotencyKey: input.context.operationKey, correlationId: input.context.correlationId,
    reasonCode: input.context.reasonCode, evidenceRefs: input.context.evidenceRefs,
    redactedPayloadJson: stableStringify(input.payload), payloadHash: canonicalDigest(input.payload),
    createdAt: input.createdAt,
  })}`
}

function storedSupplyAuditEffectRef(existing: Doc<'auditEvents'>): string {
  return `${existing.eventId}#${canonicalDigest({
    eventId: existing.eventId, eventType: existing.eventType,
    actorKind: existing.actorKind, actorRef: existing.actorRef,
    targetType: existing.targetType, targetRef: existing.targetRef,
    beforeState: existing.beforeState ?? '', afterState: existing.afterState ?? '',
    idempotencyKey: existing.idempotencyKey ?? '', correlationId: existing.correlationId ?? '',
    reasonCode: existing.reasonCode ?? '', evidenceRefs: existing.evidenceRefs ?? [],
    redactedPayloadJson: existing.redactedPayloadJson ?? '', payloadHash: existing.payloadHash ?? '',
    createdAt: existing.createdAt,
  })}`
}

function supplyAuditEventId(input: SupplyAuditInput): string {
  return `audit:capability_supply:${canonicalDigest({
    action: input.action, eventType: input.eventType, targetType: input.targetType, targetRef: input.targetRef,
    actorKind: input.actor.kind, actorRef: input.actor.ref, operationKey: input.context.operationKey,
  })}`
}

function storedAuditMatches(
  existing: Doc<'auditEvents'>,
  input: SupplyAuditInput,
  allowedBeforeStates: readonly string[],
): boolean {
  const redactedPayloadJson = stableStringify(input.payload)
  const payloadHash = canonicalDigest(input.payload)
  return existing.eventId === supplyAuditEventId(input)
    && existing.eventType === input.eventType
    && existing.actorKind === input.actor.kind
    && existing.actorRef === input.actor.ref
    && existing.targetType === input.targetType
    && existing.targetRef === input.targetRef
    && existing.beforeState !== undefined
    && allowedBeforeStates.includes(existing.beforeState)
    && existing.afterState === input.afterState
    && existing.idempotencyKey === input.context.operationKey
    && existing.correlationId === input.context.correlationId
    && existing.reasonCode === input.context.reasonCode
    && sameStrings(existing.evidenceRefs, input.context.evidenceRefs)
    && existing.redactedPayloadJson === redactedPayloadJson
    && existing.payloadHash === payloadHash
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
