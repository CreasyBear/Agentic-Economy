import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { listOpenApprovalProposals } from './lib/adminConsole/approvals'
import { defineAdminQuery } from './lib/adminConsole/registrars'
import {
  adminApprovalProposalValue,
  adminAuditFilterValue,
  adminAuditRowValue,
  listAdminAuditEventsPage,
} from './lib/adminConsole/reads/audit'

export const listAdminAuditEvents = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {
    filter: adminAuditFilterValue,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminAuditRowValue),
  handler: async (ctx, args) => {
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

export const listAdminApprovalProposals = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.array(adminApprovalProposalValue),
  handler: async (ctx) => [...await listOpenApprovalProposals(ctx)],
})
