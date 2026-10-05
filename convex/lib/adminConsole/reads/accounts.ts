import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v, type Infer } from 'convex/values'
import { accountLifecycleValue } from '@/modules/principal-account/account/public'
import type { QueryCtx } from '../../../_generated/server'

export const adminAccountRowValue = v.object({
  accountRef: v.string(), displayName: v.string(), lifecycle: accountLifecycleValue,
  createdAt: v.number(), updatedAt: v.number(),
})

/** Requires server admin admission. Ensures one bounded, redacted native page.
 * Account identity is global; purchase history applies the deployment environment.
 * Invalid search refuses; no ownership, credential or private profile data leaves this projection. */
export async function listAdminAccounts(ctx: QueryCtx, args: { search?: string; paginationOpts: PaginationOptions }): Promise<PaginationResult<Infer<typeof adminAccountRowValue>>> {
  const search = args.search?.trim() ?? ''
  if (search.length > 120) throw new Error('admin_account_search_too_long')
  const paginationOpts = { ...args.paginationOpts, numItems: Math.min(50, args.paginationOpts.numItems) }
  const result = search.length === 0
    ? await ctx.db.query('accounts').order('desc').paginate(paginationOpts)
    : await ctx.db.query('accounts').withSearchIndex('search_displayName', q => q.search('displayName', search)).paginate(paginationOpts)
  return { ...result, page: result.page.map(({ accountRef, displayName, lifecycle, createdAt, updatedAt }) => ({
    accountRef, displayName, lifecycle, createdAt, updatedAt,
  })) }
}
