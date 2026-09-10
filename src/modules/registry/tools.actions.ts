import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { defineAction } from '@/modules/common/action'
import { sourceFreshnessState } from '@/modules/common/freshness'
import {
  registryToolsCompareContract,
  registryToolsDescribeContract,
  registryToolsListContract,
  registryToolsSearchContract,
} from './tool-action-contracts'
import {
  readCapabilityToolCompare,
  readCapabilityToolDetail,
  readCapabilityToolSearch,
} from '@/modules/capability-supply/tool-source'
import type { ToolSearchFilters } from '@/modules/capability-supply/public'
import { decodeOpaqueCursor, encodeOpaqueCursor, InvalidOpaqueCursorError } from './opaque-cursor'
import {
  projectToolCompareChoices,
  projectToolDescription,
  projectToolListChoices,
  projectToolSearchChoices,
  type SupplyProjectionFreshness,
} from './tool-choice-contracts'

// `market-tools/list` and `market-tools/search` read `registrySearchDocuments`,
// kept current by the hourly "reconcile business supply projections" workload
// cron (`convex/workloadCron.ts`). The threshold check reuses the DRY'd
// `sourceFreshnessState` from `@/modules/common/freshness` (also used by
// `market/x402-directory-index.server.ts`); `common` has no dependencies, so
// both `registry` and `market` can import it without a `registry -> market`
// edge (module-boundaries.ts).
const SUPPLY_PROJECTION_STALE_AFTER_MS = 3 * 60 * 60 * 1000 // one missed hourly run before flagging stale
const latestSupplyProjectionCompletionQuery = sourceQuery<Record<string, never>, number | null>(
  'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion',
)

async function readSupplyProjectionFreshness(now: number = Date.now()): Promise<SupplyProjectionFreshness> {
  try {
    const completedAt = await callPublicSourceQuery(latestSupplyProjectionCompletionQuery, {})
    return {
      source: 'supply_projection',
      state: sourceFreshnessState(completedAt === null ? {} : { completedAt }, SUPPLY_PROJECTION_STALE_AFTER_MS, now),
      ...(completedAt === null ? {} : { completedAt }),
      staleAfterMs: SUPPLY_PROJECTION_STALE_AFTER_MS,
    }
  } catch {
    return { source: 'supply_projection', state: 'absent', staleAfterMs: SUPPLY_PROJECTION_STALE_AFTER_MS }
  }
}

// The market-tools opaque cursor (AIP-158 opacity, review issue Well 4/C5+C22)
// scopes to this freshness read's completion timestamp rather than a
// directory generation: there is no generation concept for the
// supply-projection sweep, only "as of which completed reconcile". `'current'`
// covers the (rare) case where no reconcile has ever completed yet.
function marketToolsCursorScope(freshness: SupplyProjectionFreshness): string {
  return freshness.completedAt === undefined ? 'current' : String(freshness.completedAt)
}

/** Decodes an incoming market-tools cursor, throwing when it is malformed or bound to a stale/foreign scope. */
function decodeMarketToolsCursor(cursor: string | undefined, scope: string): string | undefined {
  if (cursor === undefined) return undefined
  const decoded = decodeOpaqueCursor(cursor, { kind: 'market-tools', scope })
  if (decoded === undefined) throw new InvalidOpaqueCursorError()
  return decoded
}

/** Wraps a raw engine `nextCursor` (when present) in the opaque, scope-bound envelope before it reaches the caller. */
function opaquePagination<P extends Readonly<{ nextCursor?: string | undefined; limit: number; hasMore: boolean }>>(
  pagination: P,
  scope: string,
): P {
  return pagination.nextCursor === undefined
    ? pagination
    : { ...pagination, nextCursor: encodeOpaqueCursor({ kind: 'market-tools', scope, cursor: pagination.nextCursor }) }
}

function sourceFilters(filters: {
  networkId?: string | undefined
  location?: string | undefined
  effects?: readonly ('data_release' | 'financial_exposure' | 'external_state_change')[] | undefined
  dataUse?: readonly ('public' | 'personal' | 'sensitive' | 'credential')[] | undefined
  healthStatus?: readonly ('operational' | 'degraded' | 'unverified')[] | undefined
  currency?: string | undefined
  maximumPrice?: { currency: string; units: string; exponent: number } | undefined
} | undefined): ToolSearchFilters | undefined {
  if (filters === undefined) return undefined
  return {
    ...(filters.networkId === undefined ? {} : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: filters.effects }),
    ...(filters.dataUse === undefined ? {} : { dataUse: filters.dataUse }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  }
}

export const registryToolsListAction = defineAction({
  ...registryToolsListContract,
  run: async ({ data }) => {
    const freshness = await readSupplyProjectionFreshness()
    const scope = marketToolsCursorScope(freshness)
    const cursor = decodeMarketToolsCursor(data.cursor, scope)
    const filters = sourceFilters(data.filters)
    const projected = projectToolListChoices(await readCapabilityToolSearch({
      query: '',
      limit: data.limit,
      ...(data.source === undefined ? {} : { source: data.source }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
    return projected.kind === 'unavailable'
      ? projected
      : { ...projected, pagination: opaquePagination(projected.pagination, scope), freshness }
  },
})

export const registryToolsSearchAction = defineAction({
  ...registryToolsSearchContract,
  run: async ({ data }) => {
    const freshness = await readSupplyProjectionFreshness()
    const scope = marketToolsCursorScope(freshness)
    const cursor = decodeMarketToolsCursor(data.cursor, scope)
    const filters = sourceFilters(data.filters)
    const projected = projectToolSearchChoices(await readCapabilityToolSearch({
      query: data.query,
      limit: data.limit,
      ...(data.source === undefined ? {} : { source: data.source }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
    return projected.kind === 'unavailable'
      ? projected
      : { ...projected, pagination: opaquePagination(projected.pagination, scope), freshness }
  },
})

export const registryToolsDescribeAction = defineAction({
  ...registryToolsDescribeContract,
  run: async ({ data }) => projectToolDescription(await readCapabilityToolDetail(data)),
})

export const registryToolsCompareAction = defineAction({
  ...registryToolsCompareContract,
  run: async ({ data }) => projectToolCompareChoices(await readCapabilityToolCompare(data)),
})
