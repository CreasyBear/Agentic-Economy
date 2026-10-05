import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { query } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { activityFilterArgs, adminPurchaseRowValue, listAdminPurchaseActivity } from './lib/adminConsole/reads/activity'
import { adminAccountRowValue, listAdminAccounts } from './lib/adminConsole/reads/accounts'

export const listPurchases = query({
  args: { ...activityFilterArgs, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminPurchaseRowValue),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
    if (authority.kind === 'denied') return { page: [], isDone: true, continueCursor: '' }
    return await listAdminPurchaseActivity(ctx, args)
  },
})

export const listAccounts = query({
  args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminAccountRowValue),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
    if (authority.kind === 'denied') return { page: [], isDone: true, continueCursor: '' }
    return await listAdminAccounts(ctx, args)
  },
})
