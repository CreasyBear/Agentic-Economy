import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { adminProviderRowValue } from './lib/adminConsole/reads/provider'

export const listAdminProviders = query({
  args: {
    filter: v.union(v.literal('all'), v.literal('suppressed')),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(adminProviderRowValue),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(ctx, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const result = args.filter === 'suppressed'
      ? await ctx.db.query('businesses')
          .withIndex('by_businessContext_kind_and_suppressedAt', (index) => index
            .eq('businessContext.kind', 'programmable_provider')
            .gte('suppressedAt', 0))
          .paginate(args.paginationOpts)
      : await ctx.db.query('businesses')
          .withIndex('by_businessContext_kind_and_slug', (index) => index
            .eq('businessContext.kind', 'programmable_provider'))
          .paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.map((business) => ({
        slug: business.slug,
        publicStatus: business.publicStatus,
        trustTier: business.trustTier,
        suppressedAt: business.suppressedAt ?? null,
        updatedAt: business.updatedAt,
      })),
    }
  },
})
