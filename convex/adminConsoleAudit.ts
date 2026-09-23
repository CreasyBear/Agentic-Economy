import { query } from './_generated/server'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { AdminRole } from '@/modules/security/public'

import { listOpenApprovalProposals } from './lib/adminConsole/approvals'
import { resolveAdminAuthority } from './authz'
import { defineAdminQuery } from './lib/adminConsole/registrars'
import {
  adminApprovalProposalValue,
  adminAuditFilterValue,
  adminAuditRowValue,
  listAdminAuditEventsPage,
} from './lib/adminConsole/reads/audit'

const adminRoleValue = v.union(
  v.literal('owner_admin'),
  v.literal('support'),
  v.literal('reviewer'),
)

export const listAdminAuditEvents = query({
  args: {
    filter: adminAuditFilterValue,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminAuditRowValue),
  handler: async (ctx, args) => {
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
  },
})

export const readAdminAuditAccess = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.object({ kind: v.literal('allowed'), role: adminRoleValue }),
  handler: async (ctx): Promise<{ kind: 'allowed'; role: AdminRole }> => ({ kind: 'allowed', role: ctx.admin.membership.role }),
})

export const listAdminApprovalProposals = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.array(adminApprovalProposalValue),
  handler: async (ctx) => [...await listOpenApprovalProposals(ctx, ctx.admin.membership.role === 'owner_admin')],
})
