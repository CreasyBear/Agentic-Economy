import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import {
  CLERK_SECURITY_OBSERVE_OPERATION,
  CLERK_SECURITY_OBSERVE_SCOPE,
  type ClerkSecurityObservation,
} from '../src/modules/security/account-security'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  AuditSourceSystemValues,
  ActorKindValues,
  AuditTargetTypeValues,
  Package3AuditEventTypeValues,
  createPackage3AuditEvent,
} from '../src/modules/observability/public'
import { literalUnion } from '../src/modules/common/convex-literals'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../src/modules/principal-account/external-identity/public'

import { env, mutation, query, type MutationCtx } from './_generated/server'
import { serviceAssertion } from './serviceAssertion'
import { persistAuditEvent } from './securityShared'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const providerIdentifierPattern = /^https?:\/\/[^\s|]{1,500}\|user_[A-Za-z0-9_-]{1,195}$/u
const package3EventTypes = new Set<string>(Package3AuditEventTypeValues)

// Package 3 unified history starts at this deployment boundary. Older audit
// rows remain available in their existing domain-specific views.
export const ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT = Date.parse('2026-09-01T06:11:18.000Z')

const clerkSecurityEventTypeValue = v.union(
  v.literal('session.created'),
  v.literal('session.ended'),
  v.literal('session.revoked'),
  v.literal('user.updated'),
)

const observationArgs = {
  deliveryRefHash: v.string(),
  providerIdentifier: v.string(),
  eventType: clerkSecurityEventTypeValue,
  targetRefHash: v.string(),
  observedAt: v.number(),
}

const observationResult = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    eventRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('authority_conflict'),
      v.literal('event_conflict'),
    ),
  }),
)

const historyItem = v.object({
  eventRef: v.string(),
  eventType: literalUnion(Package3AuditEventTypeValues),
  actorKind: literalUnion(ActorKindValues),
  actorRef: v.string(),
  targetType: literalUnion(AuditTargetTypeValues),
  targetRef: v.string(),
  outcome: v.string(),
  sourceSystem: literalUnion(AuditSourceSystemValues),
  observedAt: v.optional(v.number()),
  recordedAt: v.number(),
  correlationRef: v.string(),
})

type ObservationResult = Infer<typeof observationResult>

export const recordClerkSecurityEventForServer = mutation({
  args: { ...observationArgs, serviceAuth: serviceAssertion },
  returns: observationResult,
  handler: async (ctx, args): Promise<ObservationResult> => {
    const { serviceAuth, ...observation } = args
    if (!validObservation(observation) || !await validServiceAssertion(observation, serviceAuth)) {
      return { kind: 'refused', code: 'authentication_required' }
    }

    const bindingRows = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (index) => index
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', observation.providerIdentifier))
      .take(2)
    if (bindingRows.length === 0) return { kind: 'accepted', status: 'ignored' }
    const binding = bindingRows[0]
    if (bindingRows.length !== 1 || binding === undefined
      || binding.lifecycle !== 'active'
      || binding.providerState.kind !== 'known'
      || binding.providerState.value !== 'active') {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', binding.principalRef))
      .unique()
    if (principal === null || principal.kind !== 'human' || principal.lifecycle !== 'active') {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const ownershipRows = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .take(2)
    const ownership = ownershipRows[0]
    if (ownershipRows.length !== 1 || ownership === undefined) {
      return { kind: 'refused', code: 'authority_conflict' }
    }
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (index) => index.eq('accountRef', ownership.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active'
      || account.currentOwnershipRef !== ownership.ownershipRef) {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    return await persistObservation(ctx, observation, {
      accountRef: account.accountRef,
      principalRef: principal.principalRef,
    })
  },
})

export const listCurrentOwnerSecurityHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(historyItem),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > 50) throw new Error('security_history_page_size_invalid')
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('security_history_authentication_required')
    const authority = await resolveInteractiveAuthorityContext(ctx.db, identity)
    const page = await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_createdAt', (index) => index
        .eq('activeAccountRef', authority.accountRef)
        .gte('createdAt', ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT))
      .filter((filter) => filter.neq(filter.field('sourceSystem'), undefined))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.flatMap((event) => {
        if (!package3EventTypes.has(event.eventType)
          || event.sourceSystem === undefined
          || event.afterState === undefined) return []
        return [{
          eventRef: event.eventId,
          eventType: event.eventType as typeof Package3AuditEventTypeValues[number],
          actorKind: event.actorKind,
          actorRef: event.actorRef,
          targetType: event.targetType,
          targetRef: event.targetRef,
          outcome: event.afterState,
          sourceSystem: event.sourceSystem,
          ...(event.observedAt === undefined ? {} : { observedAt: event.observedAt }),
          recordedAt: event.createdAt,
          correlationRef: event.correlationId,
        }]
      }),
    }
  },
})

async function validServiceAssertion(
  command: ClerkSecurityObservation,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(CLERK_SECURITY_OBSERVE_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation: CLERK_SECURITY_OBSERVE_OPERATION,
      command,
      assertion,
    })
}

function validObservation(value: ClerkSecurityObservation): boolean {
  return digestPattern.test(value.deliveryRefHash)
    && digestPattern.test(value.targetRefHash)
    && providerIdentifierPattern.test(value.providerIdentifier)
    && Number.isSafeInteger(value.observedAt)
    && value.observedAt >= 0
}

async function persistObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ accountRef: string; principalRef: string }>,
): Promise<ObservationResult> {
  const digestValue = observation.deliveryRefHash.slice('sha256:'.length)
  const eventRef = `audit:clerk:${digestValue}`
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (index) => index.eq('eventId', eventRef))
    .unique()
  const commandDigest = canonicalDigest(observation)
  const projection = eventProjection(observation, authority.accountRef)
  if (existing !== null) {
    return existing.activeAccountRef === authority.accountRef
      && existing.eventType === projection.eventType
      && existing.targetType === projection.targetType
      && existing.targetRef === projection.targetRef
      && existing.payloadHash === commandDigest
      ? { kind: 'accepted', status: 'replayed', eventRef }
      : { kind: 'refused', code: 'event_conflict' }
  }

  const operationRef = `clerk:${digestValue}`
  const createdAt = Date.now()
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: projection.eventType,
    actorKind: 'owner',
    actorRef: authority.principalRef,
    activeAccountRef: authority.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: observation.observedAt,
    targetType: projection.targetType,
    targetRef: projection.targetRef,
    idempotencyKey: brandNonEmpty(operationRef, 'OperationKey'),
    correlationId: brandNonEmpty(operationRef, 'CorrelationId'),
    beforeState: projection.beforeState,
    outcome: projection.outcome,
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: { eventType: observation.eventType },
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt,
  })
  if (!audit.valid) throw new Error(`clerk_security_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
  return { kind: 'accepted', status: 'applied', eventRef }
}

function eventProjection(
  observation: ClerkSecurityObservation,
  accountRef: string,
): Readonly<{
  eventType: 'account.session.created' | 'account.session.ended' | 'account.session.revoked' | 'account.security_profile.updated'
  targetType: 'session' | 'security_profile'
  targetRef: string
  beforeState: string
  outcome: string
}> {
  if (observation.eventType === 'user.updated') {
    return {
      eventType: 'account.security_profile.updated',
      targetType: 'security_profile',
      targetRef: `security-profile:${accountRef}`,
      beforeState: 'previous_profile_unknown',
      outcome: 'updated',
    }
  }
  const targetRef = `clerk-session:${observation.targetRefHash.slice('sha256:'.length)}`
  if (observation.eventType === 'session.created') {
    return { eventType: 'account.session.created', targetType: 'session', targetRef, beforeState: 'not_observed', outcome: 'created' }
  }
  if (observation.eventType === 'session.ended') {
    return { eventType: 'account.session.ended', targetType: 'session', targetRef, beforeState: 'active_or_unknown', outcome: 'ended' }
  }
  return { eventType: 'account.session.revoked', targetType: 'session', targetRef, beforeState: 'active_or_unknown', outcome: 'revoked' }
}
