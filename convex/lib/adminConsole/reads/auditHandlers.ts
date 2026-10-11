import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator, type PaginationOptions } from 'convex/server'
import type { AdminAuditFilter } from '@/lib/operator/admin-console/audit.contracts'
import type { AdminRole } from '@/modules/security/public'
import type { AllowedAdminAuthority } from '@/lib/operator/admin-console/contracts'
import type { QueryCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { listOpenApprovalProposals } from '../approvals/approvals'
import { adminApprovalProposalValue, adminAuditFilterValue, adminAuditRowValue, listAdminAuditEventsPage } from './audit'

export const adminRoleValue = v.union(
  v.literal('owner_admin'),
  v.literal('support'),
  v.literal('reviewer'),
)
export const listAdminAuditEventsArgs = {
  filter: adminAuditFilterValue,
  paginationOpts: paginationOptsValidator,
  refreshAt: v.optional(v.number()),
}
export const listAdminAuditEventsResult = paginationResultValidator(adminAuditRowValue)
export const readAdminAuditAccessArgs = {}
export const readAdminAuditAccessResult = v.object({ kind: v.literal('allowed'), role: adminRoleValue, actorRef: v.string() })
export const listAdminApprovalProposalsArgs = {
  paginationOpts: paginationOptsValidator,
  refreshAt: v.optional(v.number()),
}
export const listAdminApprovalProposalsResult = paginationResultValidator(adminApprovalProposalValue)

export async function listAdminAuditEventsHandler(
  ctx: QueryCtx,
  args: { filter: AdminAuditFilter; paginationOpts: PaginationOptions; refreshAt?: number },
) {
  const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
  if (authority.kind === 'denied') {
    return { page: [], isDone: true, continueCursor: '' }
  }
  const result = await listAdminAuditEventsPage(ctx, args.filter, args.paginationOpts)
  return {
    ...result,
    page: result.page.map((row) => ({
      ...row,
      admin: row.admin === null
        ? null
        : { ...row.admin, evidenceRefs: [...row.admin.evidenceRefs] },
    })),
  }
}

export async function readAdminAuditAccessHandler(
  ctx: QueryCtx & { admin: AllowedAdminAuthority },
): Promise<{ kind: 'allowed'; role: AdminRole; actorRef: string }> {
  return { kind: 'allowed', role: ctx.admin.membership.role, actorRef: ctx.admin.membership.tokenIdentifier }
}

export async function listAdminApprovalProposalsHandler(
  ctx: QueryCtx,
  { paginationOpts, refreshAt }: { paginationOpts: PaginationOptions; refreshAt?: number },
) {
  const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
  if (authority.kind === 'denied') return { page: [], isDone: true, continueCursor: '' }
  return await listOpenApprovalProposals(ctx, authority.membership.role === 'owner_admin', paginationOpts, refreshAt ?? Date.now())
}
