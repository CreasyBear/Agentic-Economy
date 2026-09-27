import { query } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import {
  adminExceptionOverviewValue,
  adminExceptionPageArgs,
  adminExceptionPageValue,
  adminExceptionValue,
  adminResolutionRowValue,
  listAdminExceptionsPage as readAdminExceptionsPage,
  listRecentPurchaseResolutionRows,
  readAdminException as readException,
  readAdminExceptionOverview as readExceptionOverview,
} from './lib/adminConsole/reads/exceptions'
import { v } from 'convex/values'

export const listAdminExceptionsPage = query({
  args: adminExceptionPageArgs,
  returns: adminExceptionPageValue,
  handler: async (ctx, { kind, partition, paginationOpts }) => {
    const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
    if (authority.kind === 'denied') return { page: [], isDone: true, continueCursor: '' }
    return await readAdminExceptionsPage(ctx, kind, partition, paginationOpts)
  },
})
export const readAdminExceptionOverview = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: adminExceptionOverviewValue,
  handler: async (ctx) => await readExceptionOverview(ctx),
})
export const readAdminException = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {
    kind: v.union(v.literal('removal_dispute'), v.literal('admission_case')),
    ref: v.string(),
  },
  returns: v.union(adminExceptionValue, v.null()),
  handler: async (ctx, { kind, ref }) => await readException(ctx, kind, ref),
})

export const listRecentPurchaseResolutions = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: {},
  returns: v.array(adminResolutionRowValue),
  handler: async (ctx) => [...await listRecentPurchaseResolutionRows(ctx)],
})
