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

import type { Doc } from './_generated/dataModel'
import { env, mutation, query, type MutationCtx } from './_generated/server'
import { persistAgentAudit } from './lib/agentAccess/principals/records'
import { serviceAssertion } from './serviceAssertion'
import { persistAuditEvent } from './securityShared'
import { resolveInteractiveAuthorityContext } from './interactiveAuthority'

const MACHINE_AGENT_CASCADE_CAP = 64

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
  v.literal('user.deleted'),
)

const observationArgs = {
  deliveryRefHash: v.string(),
  providerIdentifier: v.string(),
  eventType: clerkSecurityEventTypeValue,
  targetRefHash: v.string(),
  observedAt: v.number(),
  securityAction: v.optional(
    v.union(
      v.literal('observe_only'),
      v.literal('revoke_interactive_credentials'),
      v.literal('retire_personal_account'),
    ),
  ),
  profileDisplayName: v.optional(v.string()),
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
    let accountRef: string | undefined = ownershipRows[0]?.accountRef
    if (accountRef === undefined) {
      const membershipRows = await ctx.db.query('memberships')
        .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
          .eq('memberPrincipalRef', principal.principalRef)
          .eq('lifecycle', 'active'))
        .take(2)
      accountRef = membershipRows[0]?.accountRef
      if (accountRef === undefined) {
        return { kind: 'refused', code: 'authority_conflict' }
      }
    }
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (index) => index.eq('accountRef', accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    return await persistObservation(ctx, observation, {
      accountRef: account.accountRef,
      principalRef: principal.principalRef,
      bindingRef: binding.bindingRef,
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

export const listCurrentOwnerAgentSecurityHistory = query({
  args: {
    principalRef: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(historyItem),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.paginationOpts.numItems)
      || args.paginationOpts.numItems < 1
      || args.paginationOpts.numItems > 50) throw new Error('security_history_page_size_invalid')
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new Error('security_history_authentication_required')
    const authority = await resolveInteractiveAuthorityContext(ctx.db, identity)
    if (authority.provenance.accessKind !== 'ownership') throw new Error('agent_history_not_found')
    const [principal, membership, admission] = await Promise.all([
      ctx.db.query('principals')
        .withIndex('by_principalRef', (index) => index.eq('principalRef', args.principalRef))
        .unique(),
      ctx.db.query('memberships')
        .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
          .eq('accountRef', authority.accountRef)
          .eq('memberPrincipalRef', args.principalRef)
          .eq('lifecycle', 'active'))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (index) => index.eq('principalId', args.principalRef))
        .unique(),
    ])
    if (principal?.kind !== 'agent'
      || membership === null
      || admission === null
      || admission.ownerId !== authority.accountRef) throw new Error('agent_history_not_found')

    const page = await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (index) => index
        .eq('activeAccountRef', authority.accountRef)
        .eq('targetType', 'agent')
        .eq('targetRef', args.principalRef)
        .gte('createdAt', ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((event) => {
        if (!package3EventTypes.has(event.eventType)
          || event.sourceSystem === undefined
          || event.afterState === undefined) throw new Error('agent_history_event_invalid')
        return {
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
        }
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
    && (value.profileDisplayName === undefined
      || (typeof value.profileDisplayName === 'string'
        && value.profileDisplayName.length > 0
        && value.profileDisplayName.length <= 200))
}

async function persistObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ accountRef: string; principalRef: string; bindingRef: string }>,
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

  const toolRef = `clerk:${digestValue}`
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
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: projection.beforeState,
    outcome: projection.outcome,
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: { eventType: observation.eventType },
    commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
    createdAt,
  })
  if (!audit.valid) throw new Error(`clerk_security_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
  if (observation.profileDisplayName !== undefined) {
    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', authority.principalRef))
      .unique()
    if (
      principal !== null
      && principal.kind === 'human'
      && principal.lifecycle === 'active'
      && principal.displayName !== observation.profileDisplayName
      && observation.observedAt >= principal.updatedAt
    ) {
      await ctx.db.patch(principal._id, {
        displayName: observation.profileDisplayName,
        revision: principal.revision + 1,
        updatedAt: createdAt,
      })
    }
  }
  const machineCascadeApplies = observation.securityAction === 'revoke_interactive_credentials'
    && observation.eventType === 'user.updated'
  if (observation.securityAction === 'revoke_interactive_credentials') {
    await revokeInteractiveCredentialsForObservation(ctx, observation, authority, createdAt)
  }
  if (machineCascadeApplies) {
    await revokeMachineAgentsForCreatorObservation(ctx, observation, authority, createdAt, toolRef)
  }
  return { kind: 'accepted', status: 'applied', eventRef }
}

async function revokeMachineAgentsForCreatorObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ principalRef: string }>,
  createdAt: number,
  correlationRef: string,
): Promise<void> {
  const accountRefs = new Set<string>()
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', authority.principalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const ownership of ownershipRows) accountRefs.add(ownership.accountRef)

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', authority.principalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const membership of membershipRows) accountRefs.add(membership.accountRef)

  const matchedAgents: Doc<'agentAccessPrincipals'>[] = []
  for (const accountRef of accountRefs) {
    if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
    const agents = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (index) => index
        .eq('ownerId', accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const agent of agents) {
      if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
      if (!await machineAgentCreatedByHuman(ctx, agent, accountRef, authority.principalRef, observation.providerIdentifier)) {
        continue
      }
      matchedAgents.push(agent)
    }
  }

  for (const agent of matchedAgents) {
    await revokeMachineAgentAdmissionAndDependents(ctx, agent, observation, authority, createdAt, correlationRef)
  }
}

async function machineAgentCreatedByHuman(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  accountRef: string,
  humanPrincipalRef: string,
  providerIdentifier: string,
): Promise<boolean> {
  if (agent.ownerTokenIdentifier === providerIdentifier) return true
  if (agent.ownerTokenIdentifier !== undefined) return false
  const membership = await ctx.db.query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('accountRef', accountRef)
      .eq('memberPrincipalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .unique()
  return membership?.createdBy.actorPrincipalRef === humanPrincipalRef
}

async function revokeMachineAgentAdmissionAndDependents(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ principalRef: string }>,
  createdAt: number,
  correlationRef: string,
): Promise<void> {
  if (agent.lifecycle !== 'revoked') {
    await ctx.db.patch(agent._id, { lifecycle: 'revoked', lastSeenAt: createdAt })
  }

  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_principalId', (index) => index.eq('principalId', agent.principalId))
    .collect()
  for (const grant of grants) {
    if (grant.lifecycle !== 'active') continue
    await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: createdAt })
  }

  const families = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_principalRef_and_lifecycle', (index) => index
      .eq('principalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const family of families) {
    await ctx.db.patch(family._id, {
      lifecycle: 'revoked',
      revocationReason: 'clerk_password_reset',
      updatedAt: createdAt,
    })
  }

  for (const lifecycle of ['active', 'stale'] as const) {
    const credentials = await ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (index) => index
        .eq('principalRef', agent.principalId)
        .eq('lifecycle', lifecycle))
      .collect()
    for (const credential of credentials) {
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: observation.observedAt,
        revision: credential.revision + 1,
        updatedAt: createdAt,
      })
    }
  }

  const delegations = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (index) => index
      .eq('subjectPrincipalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const delegation of delegations) {
    await ctx.db.patch(delegation._id, { lifecycle: 'revoked' })
  }

  await persistAgentAudit(ctx, {
    eventType: 'agent.disconnected',
    actorPrincipalRef: authority.principalRef,
    activeAccountRef: agent.ownerId,
    agentRef: agent.principalId,
    correlationRef,
    idempotencyRef: canonicalDigest({
      format: 'clerk-machine-cascade-disconnect:v1',
      correlationRef,
      agentPrincipalRef: agent.principalId,
      deliveryRefHash: observation.deliveryRefHash,
    } as never),
    beforeState: 'connected_or_attention',
    outcome: 'disconnected',
    occurredAt: createdAt,
  })
}

async function revokeInteractiveCredentialsForObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ principalRef: string; bindingRef: string }>,
  createdAt: number,
): Promise<void> {
  for (const lifecycle of ['active', 'stale'] as const) {
    const credentials = await ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (index) => index
        .eq('principalRef', authority.principalRef)
        .eq('lifecycle', lifecycle))
      .collect()
    for (const credential of credentials) {
      if (credential.type !== 'provider_token'
        || credential.bindingRef !== authority.bindingRef
        || credential.issuedAt > observation.observedAt) {
        continue
      }
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: observation.observedAt,
        revision: credential.revision + 1,
        updatedAt: createdAt,
      })
    }
  }
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
