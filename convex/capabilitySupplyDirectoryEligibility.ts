import { listingTier } from '@/modules/capability-supply/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { activeDirectoryGeneration } from './lib/x402DirectoryIndex/rows'

/**
 * The admitted registry (`capabilitySupplyTools.search/detail/compare`, and
 * therefore `capabilityToolCatalog`'s MCP/CLI/HTTP surface, plus the business
 * supply projection rebuild in `capabilitySupplyProjection.ts`) applies no
 * directory quality bar today - only the market's own directory browse
 * (`x402DirectoryIndex.ts`, via `marketDirectorySearchEntries.eligible`)
 * does. `capabilityPublications` never stores the adoption/telemetry signals
 * `isDirectoryEntryEligible` needs (hasOutputSchema/hasOutputExample/
 * payersOrder are directory-projection-only columns), so this joins to the
 * admitted publication's directory row by `sourceRouteRef` - the same
 * reverse-lookup `x402DirectoryIndex.ts:canonicalUrlForTool` already performs
 * - and reads its precomputed `eligible` boolean rather than re-deriving the
 * predicate here. Reviewed-tier publications (`provider_owned`/
 * `ae_curated_external`) never came from the directory, so they are exempt.
 *
 * A listed-tier publication is admitted only once it already cleared
 * `isDirectoryEntryEligible` at ingest time
 * (facilitator-discovery-ingest.ts:decideFacilitatorDiscoveryItem), so a
 * missing directory row - the resource was never indexed by a directory
 * refresh, or the row predates the `eligible`/`sourceRouteRef` backfill -
 * is not evidence of ineligibility and stays visible: gating it out here too
 * would just be re-deriving a decision the ingest gate already made, off a
 * signal (or lack of one) that is not this publication's. The join exists to
 * catch the opposite drift: a Tool that WAS eligible at admission but whose
 * adoption has since fallen below the bar. The directory's periodic refresh
 * recomputes `eligible` on every generation; the admitted registry never
 * re-checks its own ingest-time decision on its own, so only an *explicit*
 * `eligible: false` on the current generation's row closes that gap here.
 */
export async function directoryListingEligible(
  ctx: Pick<QueryCtx, 'db'>,
  authorityMode: Doc<'capabilityPublications'>['authorityMode'],
  sourceRouteRef: string | undefined,
): Promise<boolean> {
  return (await directoryListingEntry(ctx, authorityMode, sourceRouteRef)).eligible
}

/**
 * Same join as `directoryListingEligible`, additionally returning the
 * directory row (when one was found) so a single caller - today only
 * `capabilitySupplyToolShared.ts:toolRecordProjection` - can also read
 * `providerKey`/`slug` for the canonical Tool URL without a second query
 * against `marketDirectorySearchEntries` for the same publication.
 */
export async function directoryListingEntry(
  ctx: Pick<QueryCtx, 'db'>,
  authorityMode: Doc<'capabilityPublications'>['authorityMode'],
  sourceRouteRef: string | undefined,
): Promise<Readonly<{ eligible: boolean; row: Doc<'marketDirectorySearchEntries'> | null }>> {
  if (listingTier(authorityMode) === 'reviewed') return { eligible: true, row: null }
  if (sourceRouteRef === undefined) return { eligible: true, row: null }
  const generation = await activeDirectoryGeneration(ctx)
  if (generation === null) return { eligible: true, row: null }
  const row = await ctx.db.query('marketDirectorySearchEntries')
    .withIndex('by_generation_and_sourceRouteRef', (query) => (
      query.eq('generation', generation.generation).eq('sourceRouteRef', sourceRouteRef)
    ))
    .filter((query) => query.eq(query.field('network'), '*'))
    .first()
  return { eligible: row === null || row.eligible === undefined || row.eligible === true, row }
}
