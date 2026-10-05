import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import { alphaLearningValue, readAlphaLearning } from './lib/adminConsole/reads/alphaLearning'

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
  marketplaceMetricCountsValue,
  writeMarketplaceMetricsDayHandler,
} from './lib/adminConsole/metrics/write'
import {
  advanceMarketplaceMetricsBuild as advanceMarketplaceMetricsBuildHandler,
  buildPageArgs,
  buildProgressValue,
  buildStepValue,
  readMarketplaceMetricsBuild as readMarketplaceMetricsBuildHandler,
  startMarketplaceMetricsBuild as startMarketplaceMetricsBuildHandler,
} from './lib/adminConsole/metrics/build'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'

import { changedMetricDays as changedMetricDaysHandler, missingMetricDays as missingMetricDaysHandler, refreshContinuationValue, refreshMarketplaceMetrics as refreshMarketplaceMetricsHandler } from './lib/adminConsole/metrics/refresh'

const windowArgs = {
  from: v.number(),
  toExclusive: v.number(),
  paginationOpts: paginationOptsValidator,
}

export const readAlphaLearningSample = defineAdminQuery({
  action: 'read_admin_readbacks', args: { now: v.number() }, returns: alphaLearningValue, handler: readAlphaLearning,
})

export const snapshotMarketplaceMetricsDay = internalAction({
  args: { day: v.optional(v.string()), entityDay: v.optional(v.string()) },
  returns: v.union(
    v.object({ kind: v.union(v.literal('written'), v.literal('queued')), day: v.string() }),
    v.object({
      kind: v.literal('refused'),
      code: v.union(
        v.literal('malformed_day'),
        v.literal('multiple_currencies'),
        v.literal('unsupported_currency'),
        v.literal('environment_unavailable'),
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


export const readMarketplaceMetricsBuild = internalQuery({
  args: { entityDay: v.string() },
  returns: buildProgressValue,
  handler: async (ctx, args) => await readMarketplaceMetricsBuildHandler(ctx, args.entityDay),
})

export const startMarketplaceMetricsBuild = internalMutation({
  args: { day: v.string(), entityDay: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await startMarketplaceMetricsBuildHandler(ctx, args.day, args.entityDay)
    return null
  },
})

export const advanceMarketplaceMetricsBuild = internalMutation({
  args: buildPageArgs,
  returns: buildStepValue,
  handler: advanceMarketplaceMetricsBuildHandler,
})

export const writeMarketplaceMetricsDay = internalMutation({
  args: {
    day: v.string(),
    entityDay: v.string(),
    sourceStartedAt: v.optional(v.number()),
    counts: v.optional(v.object({
      ...marketplaceMetricCountsValue.fields,
      returningWorkspaces: v.number(),
      newTransactingWorkspaces: v.number(),
      newTransactingProviders: v.number(),
    })),
    phase: v.union(v.literal('publish'), v.literal('cleanup'), v.literal('refs')),
  },
  returns: v.null(),
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

export const refreshMarketplaceMetrics = internalAction({
  args: { continuation: v.optional(refreshContinuationValue) }, returns: v.null(),
  handler: refreshMarketplaceMetricsHandler,
})
export const missingMetricDays = internalQuery({
  args: { lastDay: v.string() }, returns: v.array(v.string()), handler: missingMetricDaysHandler,
})
export const changedMetricDays = internalQuery({
  args: windowArgs, returns: paginationResultValidator(v.string()), handler: changedMetricDaysHandler,
})
