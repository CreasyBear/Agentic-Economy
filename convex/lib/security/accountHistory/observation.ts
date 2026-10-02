import { v, type Infer } from 'convex/values'
import { CLERK_SECURITY_OBSERVE_OPERATION, CLERK_SECURITY_OBSERVE_SCOPE, type ClerkSecurityObservation } from '../../../../src/modules/security/account-security'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { createPackage3AuditEvent } from '../../../../src/modules/observability/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'
import { env, type MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError } from '../../principalAccount/interactiveAuthority/errors'
import { readInteractiveSessionRevocationCutoff } from '../../principalAccount/interactiveAuthority/sessionProof'
import { persistAuditEvent } from '../audit/persistence'
import { observationArgs, type ObservationResult } from './contracts'
import { revokeMachineAgentsForCreatorObservation } from './machineCascade'

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const providerIdentifierPattern = /^https?:\/\/[^\s|]{1,500}\|user_[A-Za-z0-9_-]{1,195}$/u

const observationArgsValidator = v.object(observationArgs)

export const recordClerkSecurityEventForServerHandler = async (ctx: MutationCtx, args: Infer<typeof observationArgsValidator> & { serviceAuth: CustomerRequestServiceAssertion }): Promise<ObservationResult> => {
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

    let revocationCutoff: number | undefined
    if (observation.securityAction === 'revoke_interactive_credentials') {
      try {
        revocationCutoff = Math.max(
          await readInteractiveSessionRevocationCutoff(ctx.db, binding),
          observation.observedAt,
        )
      } catch (error) {
        if (error instanceof InteractiveAuthorityError) return { kind: 'refused', code: 'authority_conflict' }
        throw error
      }
    }
    return await persistObservation(ctx, observation, {
      accountRef: account.accountRef,
      principalRef: principal.principalRef,
      bindingRef: binding.bindingRef,
      binding,
    }, revocationCutoff)
}

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
    && (value.securityAction !== 'revoke_interactive_credentials' || value.observedAt > 0)
    && (value.profileDisplayName === undefined
      || (typeof value.profileDisplayName === 'string'
        && value.profileDisplayName.length > 0
        && value.profileDisplayName.length <= 200))
}

async function persistObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  authority: Readonly<{ accountRef: string; principalRef: string; bindingRef: string; binding: Doc<'externalIdentityBindings'> }>,
  revocationCutoff: number | undefined,
): Promise<ObservationResult> {
  const digestValue = observation.deliveryRefHash.slice('sha256:'.length)
  const eventRef = `audit:clerk:${digestValue}`
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (index) => index.eq('eventId', eventRef))
    .unique()
  const commandDigest = canonicalDigest(observation)
  const projection = eventProjection(observation, authority.accountRef)
  if (existing !== null) {
    const sameObservation = existing.activeAccountRef === authority.accountRef
      && existing.eventType === projection.eventType
      && existing.targetType === projection.targetType
      && existing.targetRef === projection.targetRef
      && existing.payloadHash === commandDigest
    if (!sameObservation) return { kind: 'refused', code: 'event_conflict' }
    await advanceSessionRevocationCutoff(ctx, authority.binding, revocationCutoff)
    return { kind: 'accepted', status: 'replayed', eventRef }
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
  await advanceSessionRevocationCutoff(ctx, authority.binding, revocationCutoff)
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

// The audit, monotonic cutoff and credential revocation commit together.
// Duplicate deliveries change nothing once initialized; delayed deliveries
// cannot lower the cutoff, even when no active credential remains to revoke.
async function advanceSessionRevocationCutoff(
  ctx: Pick<MutationCtx, 'db'>,
  binding: Doc<'externalIdentityBindings'>,
  cutoff: number | undefined,
): Promise<void> {
  if (cutoff === undefined || cutoff === binding.interactiveSessionsRevokedBefore) return
  await ctx.db.patch(binding._id, {
    interactiveSessionsRevokedBefore: cutoff,
    revision: binding.revision + 1,
    updatedAt: Date.now(),
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
