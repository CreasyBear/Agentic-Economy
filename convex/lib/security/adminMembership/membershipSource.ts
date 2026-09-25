import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import type { AdminMembership, AdminAuthorityState } from '../../../../src/modules/security/public'

type AdminAuthorityReadSource = {
  adminMemberships: Doc<'adminMemberships'>[]
}

export async function loadAdminAuthoritySource(
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

export function hasAdminMembershipConflict(
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

export function adminAuthorityState(source: AdminAuthorityReadSource): AdminAuthorityState {
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
