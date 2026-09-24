import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite } from './lib/security/sourceWrite/admission'
import {
  bootstrapOwnerAdmin as bootstrapOwnerAdminModule,
} from '../src/modules/security/public'
import type {
  AdminMembership,
  AdminAuthorityMutationResult,
  AdminAuthorityState,
} from '../src/modules/security/public'
import { persistAdminAuthorityMutation, summarizeAudit, summarizeMembershipAudit } from './lib/security/admin/persistence'

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


type AdminAuthorityReadSource = {
  adminMemberships: Doc<'adminMemberships'>[]
}

async function loadAdminAuthoritySource(
  db: QueryCtx['db'],
  options: {
    clerkUserIds?: readonly string[]
    tokenIdentifiers?: readonly string[]
    includeActiveOwnerAdmins?: boolean
  } = {},
): Promise<AdminAuthorityReadSource> {
  const reads: Promise<Doc<'adminMemberships'>[]>[] = []
  const states = ['active', 'revoked', 'suspended'] as const
  for (const clerkUserId of options.clerkUserIds ?? []) {
    for (const state of states) {
      reads.push(db.query('adminMemberships')
        .withIndex('by_clerkUserId_and_state', (query) => query.eq('clerkUserId', clerkUserId).eq('state', state))
        .take(2))
    }
  }
  for (const tokenIdentifier of options.tokenIdentifiers ?? []) {
    for (const state of states) {
      reads.push(db.query('adminMemberships')
        .withIndex('by_tokenIdentifier_and_state', (query) => query.eq('tokenIdentifier', tokenIdentifier).eq('state', state))
        .take(2))
    }
  }
  if (options.includeActiveOwnerAdmins === true) {
    reads.push(db.query('adminMemberships')
      .withIndex('by_state_and_role', (query) => query.eq('state', 'active').eq('role', 'owner_admin'))
      .take(2))
  }
  const rows = (await Promise.all(reads)).flat()
  const memberships = new Map<string, Doc<'adminMemberships'>>()
  for (const row of rows) {
    memberships.set(String(row._id), row)
  }
  return { adminMemberships: [...memberships.values()] }
}

function hasAdminMembershipConflict(
  rows: readonly Doc<'adminMemberships'>[],
  target: { clerkUserId: string; tokenIdentifier: string },
): boolean {
  const activeRows = rows.filter((row) => row.clerkUserId === target.clerkUserId && row.state === 'active')
  if (activeRows.length > 1) {
    return true
  }

  const active = activeRows[0]
  if (
    active !== undefined
    && active.tokenIdentifier !== target.tokenIdentifier
  ) {
    return true
  }

  const tokenRows = rows.filter((row) => row.tokenIdentifier === target.tokenIdentifier)
  if (tokenRows.length > 1) {
    return true
  }
  return rows.some((row) => (
    row.tokenIdentifier === target.tokenIdentifier
    && row.clerkUserId !== target.clerkUserId
  ))
}

function adminAuthorityState(source: AdminAuthorityReadSource): AdminAuthorityState {
  return {
    adminMemberships: source.adminMemberships.map(adminMembershipFromDocument),
    adminMembershipAuditEvents: [],
    auditEvents: [],
  }
}

function adminMembershipFromDocument(row: Doc<'adminMemberships'>): AdminMembership {
  return {
    clerkUserId: row.clerkUserId,
    tokenIdentifier: row.tokenIdentifier,
    role: row.role,
    state: row.state,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    ...(row.revokedBy === undefined ? {} : { revokedBy: row.revokedBy }),
    ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
    ...(row.evidenceRef === undefined ? {} : { evidenceRef: row.evidenceRef }),
  }
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
