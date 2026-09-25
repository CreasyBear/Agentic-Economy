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
}
export const listAdminAuditEventsResult = paginationResultValidator(adminAuditRowValue)
export const readAdminAuditAccessArgs = {}
export const readAdminAuditAccessResult = v.object({ kind: v.literal('allowed'), role: adminRoleValue })
export const listAdminApprovalProposalsArgs = {}
export const listAdminApprovalProposalsResult = v.array(adminApprovalProposalValue)

export async function listAdminAuditEventsHandler(
  ctx: QueryCtx,
  args: { filter: AdminAuditFilter; paginationOpts: PaginationOptions },
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
): Promise<{ kind: 'allowed'; role: AdminRole }> {
  return { kind: 'allowed', role: ctx.admin.membership.role }
}

export async function listAdminApprovalProposalsHandler(ctx: QueryCtx & { admin: AllowedAdminAuthority }) {
  return [...await listOpenApprovalProposals(ctx, ctx.admin.membership.role === 'owner_admin')]
}
