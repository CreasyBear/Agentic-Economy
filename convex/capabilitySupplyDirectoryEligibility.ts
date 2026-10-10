import { listingTier } from '@/modules/capability-supply/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { activeDirectoryGeneration } from './lib/market/directoryIndex/rows'

/**
 * The current directory row for a listed-tier publication, joined by
 * `sourceRouteRef` (the reverse lookup `x402DirectoryIndex.ts:canonicalUrlForTool`
 * performs), so the Tool projection can read `providerKey`/`slug` for its
 * canonical URL. Directory eligibility lives on that row as a ranking signal
 * (`ingestion.ts`, `isDirectoryEntryEligible`); it never gates a published Tool.
 * Reviewed-tier publications never came from the directory and have no row.
 */
export async function directoryListingRow(
  ctx: Pick<QueryCtx, 'db'>,
  authorityMode: Doc<'capabilityPublications'>['authorityMode'],
  sourceRouteRef: string | undefined,
): Promise<Doc<'marketDirectorySearchEntries'> | null> {
  if (listingTier(authorityMode) === 'reviewed' || sourceRouteRef === undefined) return null
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return null
  return await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_sourceRouteRef', (query) => (
      query.eq('generation', generation.generation).eq('sourceRouteRef', sourceRouteRef)
    ))
    .filter((query) => query.eq(query.field('network'), '*'))
    .first()
}
