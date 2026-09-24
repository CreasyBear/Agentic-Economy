import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../sourceWrite/admission'
import { bootstrapOwnerAdmin as bootstrapOwnerAdminModule } from '../../../../src/modules/security/public'
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
