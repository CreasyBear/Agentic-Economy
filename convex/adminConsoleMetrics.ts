import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import {
  metricCallRowValue,
  metricQuoteRowValue,
  metricResolutionRowValue,
  pageCallsForWindowHandler,
  pageQuotesForWindowHandler,
  pageResolutionsForWindowHandler,
  snapshotMarketplaceMetricsDayHandler,
} from './lib/adminConsole/metrics/collect'
import {
  marketplaceMetricsRangeValue,
  marketplaceMetricsReportValue,
  pageWorkspacesForDayHandler,
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
      code: v.union(
        v.literal('malformed_day'),
        v.literal('multiple_currencies'),
        v.literal('unsupported_currency'),
      ),
    }),
  ),
  handler: snapshotMarketplaceMetricsDayHandler,
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


export const pageResolutionsForWindow = internalQuery({
  args: windowArgs,
  returns: paginationResultValidator(metricResolutionRowValue),
  handler: pageResolutionsForWindowHandler,
})


export const writeMarketplaceMetricsDay = internalMutation({
  args: {
    day: v.string(),
    entities: v.array(marketplaceEntityValue),
    counts: v.optional(marketplaceMetricCountsValue),
    replace: v.boolean(),
    complete: v.boolean(),
  },
  returns: v.boolean(),
  handler: writeMarketplaceMetricsDayHandler,
})

export const pageWorkspacesForDay = internalQuery({
  args: { day: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.string()),
  handler: pageWorkspacesForDayHandler,
})

export const readMarketplaceMetrics = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: { range: marketplaceMetricsRangeValue },
  returns: marketplaceMetricsReportValue,
  handler: async (ctx, args) => await readMarketplaceMetricsRange(ctx, args.range),
})
