import { query } from './_generated/server'
import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import {
  listAdminAuditEventsArgs, listAdminAuditEventsResult, listAdminAuditEventsHandler,
  readAdminAuditAccessArgs, readAdminAuditAccessResult, readAdminAuditAccessHandler,
  listAdminApprovalProposalsArgs, listAdminApprovalProposalsResult, listAdminApprovalProposalsHandler,
} from './lib/adminConsole/reads/auditHandlers'

export const listAdminAuditEvents = query({
  args: listAdminAuditEventsArgs,
  returns: listAdminAuditEventsResult,
  handler: listAdminAuditEventsHandler,
})

export const readAdminAuditAccess = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: readAdminAuditAccessArgs,
  returns: readAdminAuditAccessResult,
  handler: readAdminAuditAccessHandler,
})

export const listAdminApprovalProposals = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: listAdminApprovalProposalsArgs,
  returns: listAdminApprovalProposalsResult,
  handler: listAdminApprovalProposalsHandler,
})
