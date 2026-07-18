import type {
  EvidenceLoadPorts,
} from '@/modules/customer-request/route-execution/evidence-load'

import type { MutationCtx, QueryCtx } from './_generated/server'

type DbCtx = MutationCtx | QueryCtx

export function evidenceLoadPorts(ctx: DbCtx): EvidenceLoadPorts {
  return {
    getRunHeadByRequestId: async (requestId) => await ctx.db
      .query('customerRequestRouteRunHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', requestId))
      .unique(),
    getRunByRunRef: async (runRef) => await ctx.db
      .query('customerRequestRouteRuns')
      .withIndex('by_runRef', (query) => query.eq('runRef', runRef))
      .unique(),
    listAttemptsByRunRef: async (runRef, take) => await ctx.db
      .query('customerRequestRouteStepAttempts')
      .withIndex('by_runRef_and_position', (query) => query.eq('runRef', runRef))
      .take(take),
    getBindingByBindingId: async (bindingId) => await ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId))
      .unique(),
    listProblemsByRequestId: async (requestId, take) => await ctx.db
      .query('customerRequestRouteProblemReports')
      .withIndex('by_requestId', (query) => query.eq('requestId', requestId))
      .take(take),
    listProblemReportsNewest: async (limit) => await ctx.db
      .query('customerRequestRouteProblemReports')
      .order('desc')
      .take(limit),
    listProblemUpdatesByReportRef: async (reportRef, take) => await ctx.db
      .query('customerRequestRouteProblemUpdates')
      .withIndex('by_reportRef_and_version', (query) => query.eq('reportRef', reportRef))
      .take(take),
    listProblemBusinessReportsByReportRef: async (reportRef, take) => await ctx.db
      .query('customerRequestRouteProblemBusinessReports')
      .withIndex('by_reportRef_and_createdAt', (query) => query.eq('reportRef', reportRef))
      .take(take),
    now: () => Date.now(),
  }
}
