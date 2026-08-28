import { v, type Infer } from 'convex/values'
import { connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import {
  getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule,
  listIntegratedCapabilitySupply as listIntegratedCapabilitySupplyFromModule,
  listRouteableCapabilitySupply as listRouteableCapabilitySupplyFromModule,
  pricingConfigValue,
} from '@/modules/capability-supply/public'

import { registeredOperationMappingValue } from './capabilitySupplyValues'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { resolveBusinessActor } from './authz'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  authorityValue,
  cancellationValue,
  continuationValue,
  offeringOriginValue,
  presentationValue,
  type ContractRef,
} from './capabilitySupplyShared'

export const eligibleSupplyValue = v.object({
  offering: v.object({
    offeringId: v.string(),
    businessId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    origin: v.optional(offeringOriginValue),
    presentation: presentationValue,
    status: v.literal('active'),
    registrationHash: v.string(),
    searchTerms: v.optional(v.array(v.string())),
  }),
  binding: v.object({
    bindingId: v.string(),
    offeringId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    endpointUrl: v.string(),
    authority: authorityValue,
    connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
    continuation: continuationValue,
    cancellation: cancellationValue,
    adapterId: v.string(),
    configJson: v.string(),
    configDigest: v.string(),
    admission: v.literal('admitted'),
    conformance: v.literal('conformant'),
    registrationHash: v.string(),
  }),
  publication: v.optional(
    v.object({
      publicationRef: v.string(),
      revision: v.number(),
      readinessValidUntil: v.number(),
      operationRef: v.string(),
      pricingConfig: pricingConfigValue,
      priceDigest: v.string(),
      connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
      admittedOperation: v.object({
        publicationRef: v.string(),
        publicationRevision: v.number(),
        publisherRef: v.string(),
        sourceRevision: v.string(),
        sourceDigest: v.string(),
        businessId: v.string(),
        offeringId: v.string(),
        catalogOfferingRef: v.string(),
        catalogOfferingRevision: v.number(),
        offeringRegistrationHash: v.string(),
        offeringEligibilityHash: v.string(),
        bindingId: v.string(),
        bindingRegistrationHash: v.string(),
        bindingEligibilityHash: v.string(),
        bindingConfigDigest: v.string(),
        operationId: v.string(),
        contractRef: v.object({
          capabilityId: v.string(),
          version: v.number(),
          contractDigest: v.string(),
        }),
        effectDigest: v.string(),
        commercialDigest: v.string(),
        provenanceDigest: v.string(),
        qualificationDigest: v.string(),
        readinessValidUntil: v.number(),
      }),
    }),
  ),
})
export const eligibleSupplyResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    supplies: v.array(eligibleSupplyValue),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('limit_invalid'),
      v.literal('eligible_supply_limit_exceeded'),
      v.literal('supply_integrity_failure'),
      v.literal('contract_integrity_failure'),
    ),
  }),
)

export const listIntegratedArgs = {
  networkId: v.string(),
  limit: v.number(),
  now: v.number(),
} as const
export const listRouteableArgs = listIntegratedArgs
export const listMappingsArgs = {
  networkId: v.string(),
  limit: v.number(),
} as const
export const authorizeOwnerSupplyActionArgs = {
  businessId: v.id('businesses'),
} as const
export const recordCapabilityCallEventArgs = {
  eventRef: v.string(),
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  publicationRef: v.optional(v.string()),
  publicationRevision: v.optional(v.number()),
  operationRef: v.optional(v.string()),
  taskDigest: v.string(),
  eventKind: v.union(
    v.literal('supply_liquidity_fill_observed'),
    v.literal('supply_liquidity_first_success_observed'),
    v.literal('supply_liquidity_depth_observed'),
    v.literal('supply_owner_test_observed'),
  ),
  outcome: v.union(v.literal('filled'), v.literal('zero')),
  zeroReason: v.optional(
    v.union(
      v.literal('no_routeable_supply'),
      v.literal('readiness_unavailable'),
      v.literal('provider_refused'),
      v.literal('credential_unavailable'),
      v.literal('price_unavailable'),
      v.literal('insufficient_credit'),
      v.literal('input_invalid'),
      v.literal('outcome_unknown'),
    ),
  ),
  taskStartedAt: v.optional(v.number()),
  successfulAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
  eligibleDepth: v.optional(v.number()),
  observedAt: v.number(),
  evidenceRefs: v.array(v.string()),
  environment: v.union(
    v.literal('local'),
    v.literal('development'),
    v.literal('sandbox'),
    v.literal('production'),
  ),
} as const
export const recordCapabilityCallEventReturns = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('replayed') }),
)
export type RecordCapabilityCallEventArgs = Readonly<{
  eventRef: string
  businessId: Id<'businesses'>
  offeringRef: string
  publicationRef?: string | undefined
  publicationRevision?: number | undefined
  operationRef?: string | undefined
  taskDigest: string
  eventKind: 'supply_liquidity_fill_observed' | 'supply_liquidity_first_success_observed' | 'supply_liquidity_depth_observed' | 'supply_owner_test_observed'
  outcome: 'filled' | 'zero'
  zeroReason?: 'no_routeable_supply' | 'readiness_unavailable' | 'provider_refused' | 'credential_unavailable' | 'price_unavailable' | 'insufficient_credit' | 'input_invalid' | 'outcome_unknown' | undefined
  taskStartedAt?: number | undefined
  successfulAt?: number | undefined
  durationMs?: number | undefined
  eligibleDepth?: number | undefined
  observedAt: number
  evidenceRefs: string[]
  environment: 'local' | 'development' | 'sandbox' | 'production'
}>
export const listMappingsReturns = v.array(registeredOperationMappingValue)

export async function listIntegratedCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listIntegratedCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function listRouteableCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listRouteableCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
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
    now: number
  }>,
) {
  return getEligibleExactCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function listIntegratedHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number; now: number },
) {
  return (await listIntegratedCapabilitySupply(ctx.db, args)) as Infer<
    typeof eligibleSupplyResultValue
  >
}

export async function listRouteableHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number; now: number },
) {
  return (await listRouteableCapabilitySupply(ctx.db, args)) as Infer<
    typeof eligibleSupplyResultValue
  >
}

export async function listMappingsHandler(
  ctx: QueryCtx,
  args: { networkId: string; limit: number },
) {
  const rows = await ctx.db
    .query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) =>
      query.eq('networkId', args.networkId),
    )
    .take(args.limit)
  return rows.flatMap((row) => {
    const mapping = toRegisteredOperationMapping(row)
    return mapping === null ? [] : [mapping]
  })
}

export async function authorizeOwnerSupplyActionHandler(
  ctx: QueryCtx,
  args: { businessId: Id<'businesses'> },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const business = await ctx.db.get(args.businessId)
  return business !== null &&
    business.owningAccountRef === actor.canonicalAccountRef &&
    business.publicStatus === 'published' &&
    business.suppressedAt === undefined
}

export async function recordCapabilityCallEventHandler(
  ctx: MutationCtx,
  args: RecordCapabilityCallEventArgs,
) {
  if (!validCapabilityCallEvent(args)) {
    throw new Error('capability_call_event_invalid')
  }
  const initialActor = await requireCurrentCallEventOwner(ctx, args.businessId)
  const publication = await requireCurrentCallEventPublication(ctx, args)
  const payload = {
    format: 'ae.capability-call-event:v1' as const,
    eventRef: args.eventRef,
    businessId: String(args.businessId),
    offeringRef: args.offeringRef,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    operationRef: publication.operationRef,
    taskDigest: args.taskDigest,
    eventKind: args.eventKind,
    outcome: args.outcome,
    ...(args.zeroReason === undefined ? {} : { zeroReason: args.zeroReason }),
    ...(args.taskStartedAt === undefined ? {} : { taskStartedAt: args.taskStartedAt }),
    ...(args.successfulAt === undefined ? {} : { successfulAt: args.successfulAt }),
    ...(args.durationMs === undefined ? {} : { durationMs: args.durationMs }),
    ...(args.eligibleDepth === undefined ? {} : { eligibleDepth: args.eligibleDepth }),
    observedAt: args.observedAt,
    evidenceRefs: [...args.evidenceRefs],
    environment: args.environment,
  }
  const payloadHash = canonicalDigest(payload)
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (query) => query.eq('eventId', args.eventRef))
    .unique()
  if (existing !== null) {
    const existingIdentity = canonicalDigest({
      eventType: existing.eventType,
      actorKind: existing.actorKind,
      actorRef: existing.actorRef,
      businessId: existing.businessId,
      targetType: existing.targetType,
      targetRef: existing.targetRef,
      payloadHash: existing.payloadHash,
    })
    const expectedIdentity = canonicalDigest({
      eventType: 'protected_action.receipt_recorded',
      actorKind: 'owner',
      actorRef: initialActor.canonicalPrincipalRef,
      businessId: args.businessId,
      targetType: 'capability_publication',
      targetRef: publication.publicationRef,
      payloadHash,
    })
    if (existingIdentity !== expectedIdentity) {
      throw new Error('capability_call_event_identity_conflict')
    }
    return { kind: 'replayed' as const }
  }
  const consequenceActor = await requireCurrentCallEventOwner(ctx, args.businessId)
  assertSameCallEventAuthority(initialActor, consequenceActor)
  const consequencePublication = await requireCurrentCallEventPublication(ctx, args)
  await ctx.db.insert('auditEvents', {
    eventId: args.eventRef,
    eventType: 'protected_action.receipt_recorded',
    actorKind: 'owner',
    actorRef: consequenceActor.canonicalPrincipalRef,
    businessId: args.businessId,
    targetType: 'capability_publication',
    targetRef: consequencePublication.publicationRef,
    idempotencyKey: args.eventRef,
    correlationId: `capability-call:${args.taskDigest}`,
    reasonCode: args.eventKind,
    evidenceRefs: [...args.evidenceRefs],
    redactedPayloadJson: JSON.stringify(payload),
    payloadHash,
    createdAt: Date.now(),
  })
  return { kind: 'recorded' as const }
}

async function requireCurrentCallEventOwner(ctx: MutationCtx, businessId: Id<'businesses'>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    throw new Error('capability_call_event_authorization_denied')
  }
  const business = await ctx.db.get(businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
    throw new Error('capability_call_event_authorization_denied')
  }
  return actor
}

async function requireCurrentCallEventPublication(
  ctx: MutationCtx,
  args: RecordCapabilityCallEventArgs,
) {
  if (args.publicationRef === undefined
    || args.publicationRevision === undefined
    || args.operationRef === undefined) {
    throw new Error('capability_call_event_publication_identity_invalid')
  }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', args.publicationRef as string)
      .eq('revision', args.publicationRevision as number))
    .unique()
  if (publication === null
    || publication.businessId !== args.businessId
    || publication.operationRef !== args.operationRef) {
    throw new Error('capability_call_event_publication_identity_invalid')
  }
  if (publication.disposition !== 'current') {
    throw new Error('capability_call_event_publication_stale')
  }
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
    .unique()
  if (offering === null
    || offering.businessId !== args.businessId
    || offering.origin?.kind !== 'catalog_offering'
    || offering.origin.offeringRef !== args.offeringRef) {
    throw new Error('capability_call_event_publication_identity_invalid')
  }
  const consequenceNow = Date.now()
  if (args.eventKind === 'supply_owner_test_observed'
    && (publication.credentialState !== 'ready'
      || publication.healthState !== 'healthy'
      || publication.readinessValidUntil === undefined
      || publication.readinessValidUntil <= consequenceNow)) {
    throw new Error('capability_call_event_publication_stale')
  }
  return publication
}

function callEventActorFingerprint(actor: Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>) {
  return canonicalDigest({
    principalRef: actor.canonicalPrincipalRef,
    accountRef: actor.canonicalAccountRef,
    revision: actor.authorityRevision,
    provenance: {
      providerNamespace: actor.authorityProvenance.providerNamespace,
      bindingRef: actor.authorityProvenance.bindingRef,
      credentialRef: actor.authorityProvenance.credentialRef,
      credentialGeneration: actor.authorityProvenance.credentialGeneration,
      accessKind: actor.authorityProvenance.accessKind,
      accessRef: actor.authorityProvenance.accessRef,
      currentOwnershipRef: actor.authorityProvenance.currentOwnershipRef,
    },
  })
}

export function sameCallEventAuthority(
  initial: Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>,
  consequence: Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>,
) {
  return callEventActorFingerprint(initial) === callEventActorFingerprint(consequence)
}

export function assertSameCallEventAuthority(
  initial: Parameters<typeof sameCallEventAuthority>[0],
  consequence: Parameters<typeof sameCallEventAuthority>[1],
) {
  if (!sameCallEventAuthority(initial, consequence)) {
    throw new Error('capability_call_event_authority_changed')
  }
}

export function validCapabilityCallEvent(args: RecordCapabilityCallEventArgs): boolean {
  const safeOptionalNumber = (value: number | undefined) => value === undefined || (Number.isSafeInteger(value) && value >= 0)
  return args.eventRef.trim().length > 0
    && args.offeringRef.trim().length > 0
    && args.taskDigest.trim().length > 0
    && Number.isSafeInteger(args.observedAt)
    && args.observedAt >= 0
    && safeOptionalNumber(args.publicationRevision)
    && safeOptionalNumber(args.taskStartedAt)
    && safeOptionalNumber(args.successfulAt)
    && safeOptionalNumber(args.durationMs)
    && safeOptionalNumber(args.eligibleDepth)
    && args.evidenceRefs.length > 0
    && args.evidenceRefs.every((reference) => reference.trim().length > 0)
    && (args.outcome === 'zero' ? args.zeroReason !== undefined : args.zeroReason === undefined)
    && (args.taskStartedAt === undefined || args.successfulAt === undefined || args.successfulAt >= args.taskStartedAt)
    && (args.durationMs === undefined
      || (args.taskStartedAt !== undefined
        && args.successfulAt !== undefined
        && args.durationMs === Math.max(0, args.successfulAt - args.taskStartedAt)))
}
