import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineAdminQuery } from './lib/adminConsole/registrars'
import {
  countEvidenceForWindowHandler,
  countOpenUncertainCallsHandler,
  metricCallRowValue,
  metricQuoteRowValue,
  metricResolutionRowValue,
  metricUsageRowValue,
  pageCallsForWindowHandler,
  pageQuotesForWindowHandler,
  pageResolutionsForWindowHandler,
  pageUsageForWindowHandler,
  snapshotMarketplaceMetricsDayHandler,
} from './lib/adminConsole/metrics/collect'
import {
  marketplaceMetricsRangeValue,
  marketplaceMetricsReportValue,
  readMarketplaceMetricsRange,
} from './lib/adminConsole/metrics/read'
import {
  marketplaceEntityValue,
  marketplaceMetricCountsValue,
  writeMarketplaceMetricsDayHandler,
} from './lib/adminConsole/metrics/write'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'

const evidenceKindValue = v.union(
  v.literal('ae_invocation'),
  v.literal('ae_invocation_completed'),
  v.literal('ae_settlement'),
  v.literal('ae_qualified_use'),
  v.literal('ae_reconciliation_required'),
)
const windowArgs = {
  from: v.number(),
  toExclusive: v.number(),
  paginationOpts: paginationOptsValidator,
}

export const snapshotMarketplaceMetricsDay = internalAction({
  args: { day: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.literal('written'), day: v.string() }),
    v.object({
      kind: v.literal('refused'),
      code: v.union(v.literal('malformed_day'), v.literal('multiple_currencies')),
    }),
  ),
  handler: snapshotMarketplaceMetricsDayHandler,
})

export const countEvidenceForWindow = internalQuery({
  args: { kind: evidenceKindValue, from: v.number(), toExclusive: v.number() },
  returns: v.number(),
  handler: countEvidenceForWindowHandler,
})

export const pageCallsForWindow = internalQuery({
  args: windowArgs,
  returns: paginationResultValidator(metricCallRowValue),
  handler: pageCallsForWindowHandler,
})

export const pageQuotesForWindow = internalQuery({
  args: windowArgs,
  returns: paginationResultValidator(metricQuoteRowValue),
  handler: pageQuotesForWindowHandler,
})

export const pageUsageForWindow = internalQuery({
  args: windowArgs,
  returns: paginationResultValidator(metricUsageRowValue),
  handler: pageUsageForWindowHandler,
})

export const pageResolutionsForWindow = internalQuery({
  args: windowArgs,
  returns: paginationResultValidator(metricResolutionRowValue),
  handler: pageResolutionsForWindowHandler,
})

export const countOpenUncertainCalls = internalQuery({
  args: {},
  returns: v.number(),
  handler: countOpenUncertainCallsHandler,
})

export const writeMarketplaceMetricsDay = internalMutation({
  args: {
    day: v.string(),
    entities: v.array(marketplaceEntityValue),
    counts: v.optional(marketplaceMetricCountsValue),
    replace: v.boolean(),
  },
  returns: v.null(),
  handler: writeMarketplaceMetricsDayHandler,
})

export const readMarketplaceMetrics = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: { range: marketplaceMetricsRangeValue },
  returns: marketplaceMetricsReportValue,
  handler: async (ctx, args) => await readMarketplaceMetricsRange(ctx, args.range),
})
