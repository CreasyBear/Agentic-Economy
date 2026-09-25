import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveBusinessActor } from '../../../authz'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { RecordCapabilityCallEventArgs } from './contracts'

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
    toolRef: publication.toolRef,
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
    || args.toolRef === undefined) {
    throw new Error('capability_call_event_publication_identity_invalid')
  }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', args.publicationRef as string)
      .eq('revision', args.publicationRevision as number))
    .unique()
  if (publication === null
    || publication.businessId !== args.businessId
    || publication.toolRef !== args.toolRef) {
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
