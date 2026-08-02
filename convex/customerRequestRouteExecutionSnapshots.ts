import type {
  AttemptRecordSnapshot,
  DispatchRecordSnapshot,
  RunRecordSnapshot,
} from '@/modules/customer-request/route-execution/machines'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export type RouteStepGrantSnapshot = (value: unknown) => RouteStepGrant

export function toRunRecord(run: Doc<'customerRequestRouteRuns'>): RunRecordSnapshot {
  return {
    runRef: run.runRef,
    principalId: run.principalId,
    requestId: run.requestId,
    requestRevision: run.requestRevision,
    mandateRef: run.mandateRef,
    mandateDigest: run.mandateDigest,
    generationRef: run.generationRef,
    routePlanId: run.routePlanId,
    routeDigest: run.routeDigest,
    ...(run.businesses === undefined ? {} : {
      businesses: run.businesses.map((business) => ({ ...business })),
    }),
    state: run.state,
    totalSteps: run.totalSteps,
    completedSteps: run.completedSteps,
    currentPosition: run.currentPosition,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function toAttemptRecord(
  attempt: Doc<'customerRequestRouteStepAttempts'>,
  toGrant?: RouteStepGrantSnapshot,
): AttemptRecordSnapshot {
  return {
    attemptRef: attempt.attemptRef,
    attemptDigest: attempt.attemptDigest,
    runRef: attempt.runRef,
    requestId: attempt.requestId,
    mandateRef: attempt.mandateRef,
    actionId: attempt.actionId,
    position: attempt.position,
    operationKeyDigest: attempt.operationKeyDigest,
    grant: toGrant === undefined
      ? structuredClone(attempt.grant as unknown) as RouteStepGrant
      : toGrant(attempt.grant),
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    state: attempt.state,
    ...(attempt.outputJson === undefined ? {} : { outputJson: attempt.outputJson }),
    ...(attempt.outputDigest === undefined ? {} : { outputDigest: attempt.outputDigest }),
    ...(attempt.transportObservationJson === undefined
      ? {}
      : { transportObservationJson: attempt.transportObservationJson }),
    ...(attempt.transportObservationDigest === undefined
      ? {}
      : { transportObservationDigest: attempt.transportObservationDigest }),
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  }
}

export function toDispatchRecord(
  dispatch: Doc<'customerRequestRouteDispatchOutbox'>,
): DispatchRecordSnapshot {
  return {
    dispatchRef: dispatch.dispatchRef,
    dispatchDigest: dispatch.dispatchDigest,
    runRef: dispatch.runRef,
    attemptRef: dispatch.attemptRef,
    operationKeyDigest: dispatch.operationKeyDigest,
    state: dispatch.state,
    availableAt: dispatch.availableAt,
    createdAt: dispatch.createdAt,
  }
}

export async function requireRun(
  ctx: MutationCtx,
  runRef: string,
): Promise<Doc<'customerRequestRouteRuns'>> {
  const run = await ctx.db.query('customerRequestRouteRuns')
    .withIndex('by_runRef', (query) => query.eq('runRef', runRef)).unique()
  if (run === null) throw new Error('customer_request_route_run_integrity_failure')
  return run
}

export async function requireAttempt(
  ctx: MutationCtx,
  attemptRef: string,
): Promise<Doc<'customerRequestRouteStepAttempts'>> {
  const attempt = await ctx.db.query('customerRequestRouteStepAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
  if (attempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
  return attempt
}

export async function requireDispatch(
  ctx: MutationCtx,
  dispatchRef: string,
): Promise<Doc<'customerRequestRouteDispatchOutbox'>> {
  const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
    .withIndex('by_dispatchRef', (query) => query.eq('dispatchRef', dispatchRef)).unique()
  if (dispatch === null) throw new Error('customer_request_route_dispatch_integrity_failure')
  return dispatch
}

export async function requireDispatchByAttempt(
  ctx: MutationCtx,
  attemptRef: string,
): Promise<Doc<'customerRequestRouteDispatchOutbox'>> {
  const dispatch = await ctx.db.query('customerRequestRouteDispatchOutbox')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', attemptRef)).unique()
  if (dispatch === null) throw new Error('customer_request_route_dispatch_integrity_failure')
  return dispatch
}
