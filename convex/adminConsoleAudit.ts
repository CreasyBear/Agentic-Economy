import { query } from './_generated/server'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { listOpenApprovalProposals } from './lib/adminConsole/approvals'
import { resolveAdminAuthority } from './authz'
import { defineAdminQuery } from './lib/adminConsole/registrars'
import {
  adminApprovalProposalValue,
  adminAuditFilterValue,
  adminAuditRowValue,
  listAdminAuditEventsPage,
} from './lib/adminConsole/reads/audit'

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
  returns: v.object({ kind: v.literal('allowed') }),
  handler: async (): Promise<{ kind: 'allowed' }> => ({ kind: 'allowed' }),
})

export const listAdminApprovalProposals = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.array(adminApprovalProposalValue),
  handler: async (ctx) => [...await listOpenApprovalProposals(ctx)],
})
