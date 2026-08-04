import type {
  EvidenceLoadPorts,
} from '@/modules/customer-request/route-execution/evidence-load'
import { routeDispatchIntegrityValid } from '@/modules/customer-request/route-execution/journal'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { toDispatchRecord } from './customerRequestRouteExecutionSnapshots'

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
    listAttemptsByRunRef: async (runRef, take) => {
      const attempts = await ctx.db
        .query('customerRequestRouteStepAttempts')
        .withIndex('by_runRef_and_position', (query) => query.eq('runRef', runRef))
        .take(take)
      return await Promise.all(attempts.map(async (attempt) => {
        const dispatch = await ctx.db
          .query('customerRequestRouteDispatchOutbox')
          .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attempt.attemptRef))
          .unique()
        const dispatchSnapshot = dispatch === null ? undefined : toDispatchRecord(dispatch)
        const dispatchMatchesAttempt = dispatchSnapshot !== undefined
          && dispatchSnapshot.runRef === attempt.runRef
          && dispatchSnapshot.attemptRef === attempt.attemptRef
          && dispatchSnapshot.operationKeyDigest === attempt.operationKeyDigest
          && routeDispatchIntegrityValid(dispatchSnapshot)
        return {
          ...attempt,
          ...(dispatchMatchesAttempt ? { dispatchState: dispatchSnapshot.state } : {}),
        }
      }))
    },
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
