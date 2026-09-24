import { v, type Infer } from 'convex/values'
import { PERSONAL_ACCOUNT_RETIRE_OPERATION, PERSONAL_ACCOUNT_RETIRE_SCOPE } from '../../../../src/modules/security/account-security'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { createPackage3AuditEvent } from '../../../../src/modules/observability/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'
import { env, type MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { persistAuditEvent } from '../../security/audit/persistence'
import { serviceAssertion } from '../../../serviceAssertion'
import { resolveAccountRefForPrincipal } from './identity'
import { revokeMachineAgentsForCreator } from './retireDependents'

const RETIRED_PERSONAL_DISPLAY_NAME = 'Deleted User'
const digestPattern = /^sha256:[0-9a-f]{64}$/u
const providerIdentifierPattern = /^https?:\/\/[^\s|]{1,500}\|user_[A-Za-z0-9_-]{1,195}$/u
const retireEventTypeValue = v.literal('user.deleted')
const retireSecurityActionValue = v.literal('retire_personal_account')
const observationArgs = {
  deliveryRefHash: v.string(),
  providerIdentifier: v.string(),
  eventType: retireEventTypeValue,
  targetRefHash: v.string(),
  observedAt: v.number(),
  securityAction: retireSecurityActionValue,
}

export const retirePersonalAccountForServerResult = v.union(
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

type ObservationResult = Infer<typeof retirePersonalAccountForServerResult>
type RetireObservation = Readonly<{
  deliveryRefHash: string
  providerIdentifier: string
  eventType: 'user.deleted'
  targetRefHash: string
  observedAt: number
  securityAction: 'retire_personal_account'
}>

export const retirePersonalAccountForServerArgs = v.object({ ...observationArgs, serviceAuth: serviceAssertion })

export const retirePersonalAccountForServerHandler = async (ctx: MutationCtx, args: Infer<typeof retirePersonalAccountForServerArgs>): Promise<ObservationResult> => {
    const { serviceAuth, ...observation } = args
    if (!validRetireObservation(observation) || !await validRetireServiceAssertion(observation, serviceAuth)) {
      return { kind: 'refused', code: 'authentication_required' }
    }

    const bindingRows = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (index) => index
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', observation.providerIdentifier))
      .take(2)
    if (bindingRows.length === 0) return { kind: 'accepted', status: 'ignored' }
    const binding = bindingRows[0]
    if (bindingRows.length !== 1 || binding === undefined) {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', binding.principalRef))
      .unique()
    if (principal === null || principal.kind !== 'human') {
      throw new InteractiveAuthorityError('authority_conflict')
    }

    const accountRef = await resolveAccountRefForPrincipal(ctx, principal.principalRef)
    if (accountRef === undefined) {
      return { kind: 'refused', code: 'authority_conflict' }
    }

    const digestValue = observation.deliveryRefHash.slice('sha256:'.length)
    const eventRef = `audit:clerk:${digestValue}`
    const existing = await ctx.db.query('auditEvents')
      .withIndex('by_eventId', (index) => index.eq('eventId', eventRef))
      .unique()
    const commandDigest = canonicalDigest(observation)
    if (existing !== null) {
      return existing.activeAccountRef === accountRef
        && existing.eventType === 'account.personal_account.retired'
        && existing.targetRef === principal.principalRef
        && existing.payloadHash === commandDigest
        ? { kind: 'accepted', status: 'replayed', eventRef }
        : { kind: 'refused', code: 'event_conflict' }
    }

    const now = Date.now()
    const toolRef = `clerk:${digestValue}`

    await ctx.db.patch(principal._id, {
      lifecycle: 'retired',
      displayName: RETIRED_PERSONAL_DISPLAY_NAME,
      revision: principal.revision + 1,
      updatedAt: now,
    })

    await ctx.db.patch(binding._id, {
      lifecycle: 'revoked',
      providerState: { kind: 'known', value: 'revoked' },
      revokedAt: observation.observedAt,
      revision: binding.revision + 1,
      updatedAt: now,
    })

    for (const lifecycle of ['active', 'stale'] as const) {
      const credentials = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (index) => index
          .eq('principalRef', principal.principalRef)
          .eq('lifecycle', lifecycle))
        .collect()
      for (const credential of credentials) {
        if (credential.type !== 'provider_token') continue
        await ctx.db.patch(credential._id, {
          lifecycle: 'revoked',
          revokedAt: observation.observedAt,
          revision: credential.revision + 1,
          updatedAt: now,
        })
      }
    }

    const memberships = await ctx.db.query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        lifecycle: 'ended',
        endedAt: now,
        revision: membership.revision + 1,
      })
    }

    const sessionSelections = await ctx.db.query('interactiveSessionSelections')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of sessionSelections) {
      await ctx.db.delete(row._id)
    }

    const notificationEmails = await ctx.db.query('principalNotificationEmails')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of notificationEmails) {
      await ctx.db.delete(row._id)
    }

    const notificationPreferences = await ctx.db.query('userNotificationPreferences')
      .filter((filter) => filter.eq(filter.field('principalRef'), principal.principalRef))
      .collect()
    for (const row of notificationPreferences) {
      await ctx.db.patch(row._id, { deliveryEmail: undefined })
    }

    await revokeMachineAgentsForCreator(ctx, observation, principal.principalRef, now)

    const audit = createPackage3AuditEvent({
      eventId: brandNonEmpty(eventRef, 'AuditEventId'),
      eventType: 'account.personal_account.retired',
      actorKind: 'owner',
      actorRef: principal.principalRef,
      activeAccountRef: accountRef,
      sourceSystem: 'clerk_observed',
      observedAt: observation.observedAt,
      targetType: 'security_profile',
      targetRef: principal.principalRef,
      idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
      correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
      beforeState: 'active',
      outcome: 'retired',
      evidenceRefs: [`clerk-delivery:${digestValue}`],
      redactedPayload: { eventType: observation.eventType },
      commandDigest: brandNonEmpty(commandDigest, 'SourceHash'),
      createdAt: now,
    })
    if (!audit.valid) throw new Error(`personal_account_retire_audit_invalid:${audit.reason}`)
    await persistAuditEvent(ctx.db, audit.event)

    return { kind: 'accepted', status: 'applied', eventRef }
}

async function validRetireServiceAssertion(
  command: RetireObservation,
  assertion: CustomerRequestServiceAssertion,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  return key !== undefined
    && key.length >= 32
    && assertion.principalId === 'ae:server-function'
    && assertion.ownerId === 'ae:server-function'
    && assertion.credentialId === 'ae:server-function'
    && assertion.scopes.includes(PERSONAL_ACCOUNT_RETIRE_SCOPE)
    && await verifyCustomerRequestServiceAssertion({
      key,
      operation: PERSONAL_ACCOUNT_RETIRE_OPERATION,
      command,
      assertion,
    })
}

function validRetireObservation(value: RetireObservation): boolean {
  return digestPattern.test(value.deliveryRefHash)
    && digestPattern.test(value.targetRefHash)
    && providerIdentifierPattern.test(value.providerIdentifier)
    && Number.isSafeInteger(value.observedAt)
    && value.observedAt >= 0
    && value.eventType === 'user.deleted'
    && value.securityAction === 'retire_personal_account'
}
