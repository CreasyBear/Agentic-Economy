import { deserializeOperationSearchResult } from '@/modules/capability-supply/operation-projection'
import type {
  OperationSearchInput,
  OperationSearchResult,
} from '@/modules/capability-supply/public'

import { api } from './_generated/api'
import type { ActionCtx } from './_generated/server'

/**
 * Convex-native capability discovery: runs the registry's read-only `capabilitySupplyOperations:search`
 * query directly in the action and deserializes the wire result into the domain type. This keeps
 * discovery inside Convex without the TanStack server/Clerk host transport (`capability-supply/operation-source`),
 * which must never appear in the Convex bundle.
 */
export function discoverCapabilitiesPort(ctx: ActionCtx): (input: OperationSearchInput) => Promise<OperationSearchResult> {
  return async (input) => deserializeOperationSearchResult(
    await ctx.runQuery(api.capabilitySupplyOperations.search, {
      query: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    }),
  )
}
