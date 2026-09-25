import { v } from 'convex/values'

import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import {
  adminExceptionFeedValue,
  adminExceptionKindValue,
  adminResolutionRowValue,
  listAdminExceptions as readAdminExceptions,
  listRecentPurchaseResolutionRows,
} from './lib/adminConsole/reads/exceptions'

export const listAdminExceptions = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: { kind: v.union(adminExceptionKindValue, v.null()) },
  returns: adminExceptionFeedValue,
  handler: async (ctx, args) => {
    const feed = await readAdminExceptions(ctx, args.kind)
    return {
      items: [...feed.items],
      total: feed.total,
      truncated: feed.truncated,
      counts: feed.counts,
      unavailable: [...feed.unavailable],
    }
  },
})

export const listRecentPurchaseResolutions = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.array(adminResolutionRowValue),
  handler: async (ctx) => [...await listRecentPurchaseResolutionRows(ctx)],
})
