import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../sourceWrite/admission'
import { bootstrapOwnerAdmin as bootstrapOwnerAdminModule, canBootstrapOwnerAdmin } from '../../../../src/modules/security/public'
import type { AdminAuthorityMutationResult } from '../../../../src/modules/security/public'
import { persistAdminAuthorityMutation, summarizeAudit, summarizeMembershipAudit } from '../admin/persistence'
import { adminAuthorityState, hasAdminMembershipConflict, loadAdminAuthoritySource } from './membershipSource'

type BootstrapOwnerAdminHandlerArgs = {
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

/** Requires the current canonical owner and actual authenticated identity.
 * Ensures bounded eligibility/readback only; never exposes the allowlist or another caller's audit.
 * Invariant: the existing mutation remains the only bootstrap writer and arbitrates concurrent owners.
 * On violation: ineligible. An absent audit is not proof that an in-flight request cannot commit. */
export async function readOwnerAdminBootstrapHandler(ctx: QueryCtx, args: { operationKey?: string }) {
  if (args.operationKey !== undefined && (args.operationKey.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u.test(args.operationKey))) {
    return { kind: 'ineligible' as const, reason: 'invalid_request' }
  }
  const actor = await resolveBusinessActor(ctx)
  const identity = await ctx.auth.getUserIdentity()
  if (actor.kind !== 'authenticated_owner' || identity === null
    || identity.subject.trim() === '' || identity.tokenIdentifier.trim() === '') {
    return { kind: 'ineligible' as const, reason: 'canonical_owner_authority_required' }
  }
  const { subject: clerkUserId, tokenIdentifier } = identity
  const source = await loadAdminAuthoritySource(ctx.db, {
    includeActiveOwnerAdmins: true, clerkUserIds: [clerkUserId], tokenIdentifiers: [tokenIdentifier],
  })
  if (hasAdminMembershipConflict(source.adminMemberships, { clerkUserId, tokenIdentifier })) {
    return { kind: 'ineligible' as const, reason: 'membership_conflict' }
  }
  const membership = source.adminMemberships.find(row => row.clerkUserId === clerkUserId && row.tokenIdentifier === tokenIdentifier)
  const audit = args.operationKey === undefined ? null : await ctx.db.query('auditEvents')
    .withIndex('by_eventId', q => q.eq('eventId', `audit:admin.membership_bootstrapped:${clerkUserId}:${args.operationKey}`)).unique()
  if (audit !== null && (membership === undefined || audit.actorRef !== clerkUserId
    || audit.targetRef !== clerkUserId || audit.targetType !== 'admin_membership'
    || audit.eventType !== 'admin.membership_bootstrapped' || audit.idempotencyKey !== args.operationKey)) {
    return { kind: 'ineligible' as const, reason: 'membership_conflict' }
  }
  if (membership?.state === 'active' && membership.role === 'owner_admin') {
    return { kind: 'active' as const, auditEventRef: audit?.eventId ?? null }
  }
  if (audit !== null) return { kind: 'recorded' as const, auditEventRef: audit.eventId }
  const activeOwnerAdminCount = source.adminMemberships.filter(row => row.state === 'active' && row.role === 'owner_admin').length
  return canBootstrapOwnerAdmin(clerkUserId, { authorizedClerkUserIds: bootstrapPrincipalIds(), activeOwnerAdminCount })
    ? { kind: 'eligible' as const }
    : { kind: 'ineligible' as const, reason: activeOwnerAdminCount > 0 ? 'owner_admin_already_exists' : 'unauthorized_bootstrap_principal' }
}

export async function bootstrapOwnerAdminHandler(ctx: MutationCtx, args: BootstrapOwnerAdminHandlerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return adminSourceWriteDenied(sourceWrite.reason)
  }

  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return summarizeAdminMutation({
      kind: 'error',
      code: 'admin_bootstrap_denied',
      retryable: false,
      reason: 'canonical_owner_authority_required',
    })
  }
  const identity = await ctx.auth.getUserIdentity()
  const source = await loadAdminAuthoritySource(ctx.db, {
    includeActiveOwnerAdmins: true,
    ...(identity?.subject === undefined ? {} : { clerkUserIds: [identity.subject] }),
    ...(identity?.tokenIdentifier === undefined ? {} : { tokenIdentifiers: [identity.tokenIdentifier] }),
  })
  const clerkUserId = typeof identity?.subject === 'string' ? identity.subject : ''
  const tokenIdentifier = typeof identity?.tokenIdentifier === 'string' ? identity.tokenIdentifier : ''
  if (
    bootstrapPrincipalIds().includes(clerkUserId)
    && tokenIdentifier.trim().length > 0
    && hasAdminMembershipConflict(source.adminMemberships, { clerkUserId, tokenIdentifier })
  ) {
    return summarizeAdminMutation({
      kind: 'error',
      code: 'admin_bootstrap_denied',
      retryable: false,
      reason: 'membership_conflict',
    })
  }

  const result = bootstrapOwnerAdminModule(adminAuthorityState(source), {
    clerkUserId,
    tokenIdentifier,
    authorizedClerkUserIds: bootstrapPrincipalIds(),
    reasonCode: args.reasonCode,
    evidenceRefs: args.evidenceRefs,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    now: Date.now(),
  })

  await persistAdminAuthorityMutation(ctx.db, result)
  return summarizeAdminMutation(result)
}

function summarizeAdminMutation(result: AdminAuthorityMutationResult) {
  if (result.kind === 'ok') {
    return {
      kind: 'ok' as const,
      code: result.code,
      membership: result.membership,
      auditEvent: summarizeAudit(result.auditEvent),
      membershipAuditEvent: summarizeMembershipAudit(result.membershipAuditEvent),
    }
  }

  return {
    kind: 'error' as const,
    code: result.code,
    retryable: result.retryable,
    reason: result.reason,
    ...(result.auditEvent === undefined ? {} : { auditEvent: summarizeAudit(result.auditEvent) }),
    ...(result.membershipAuditEvent === undefined
      ? {}
      : { membershipAuditEvent: summarizeMembershipAudit(result.membershipAuditEvent) }),
  }
}

function bootstrapPrincipalIds(): readonly string[] {
  return envList('ADMIN_BOOTSTRAP_PRINCIPAL_IDS')
}

function adminSourceWriteDenied(reason: string) {
  return {
    kind: 'error' as const,
    code: 'admin_action_denied' as const,
    retryable: false,
    reason,
  }
}

function envList(name: string): string[] {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined
    ? []
    : value.split(',').flatMap((item) => {
        const trimmed = item.trim()
        return trimmed === '' ? [] : [trimmed]
      })
}
