import { type JsonValue } from '@/modules/capability-contract/public'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import {
  projectCustomerActionStatus,
  projectCustomerCriteria,
  projectNeedsAttention,
  projectRouteCancelled,
  projectRouteProgress,
} from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import type { ProjectableCustomerRequestAggregate } from './projectable-aggregate'

export type StoredRouteRunProjection = Readonly<{
  requestId: string
  requestRevision: number
  generationRef: string
  state: 'queued' | 'running' | 'outcome_unknown' | 'completed' | 'failed' | 'cancelled'
  totalSteps: number
  completedSteps: number
  currentPosition: number
  currentState: 'queued' | 'dispatched' | 'accepted' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled'
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  resultJson?: string
  cancellationReleaseMayStartAt?: number
  cancellationUnavailableSince?: number
  cancellationRequestedAt?: number
  cancellationAttempt?: Readonly<
    | { state: 'pending'; requestedAt: number; nextCheckAt: number }
    | { state: 'unknown'; requestedAt: number; observedAt: number; nextCheckAt: number }
    | { state: 'rejected'; requestedAt: number; observedAt: number; reason: string }
  >
  updatedAt: number
}>


export function isProviderReportedRouteFailure(result: JsonValue): boolean {
  return typeof result === 'object' && result !== null && 'reason' in result
    && result.reason === 'business_reported_failure'
}

export function isPartialRouteResult(result: JsonValue | undefined): result is JsonValue {
  return typeof result === 'object' && result !== null && 'kind' in result
    && result.kind === 'partial_result' && 'output' in result
}

export function customerProgressState(
  state: StoredRouteRunProjection['currentState'],
): 'queued' | 'ready_to_contact' | 'contacting' | 'awaiting_result' | 'completed' | 'needs_attention' {
  switch (state) {
    case 'queued':
      return 'queued'
    case 'dispatched':
      return 'contacting'
    case 'accepted':
      return 'awaiting_result'
    case 'succeeded':
      return 'completed'
    case 'failed':
    case 'outcome_unknown':
    case 'cancelled':
      return 'needs_attention'
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

export function projectStoredRouteRun(
  aggregate: ProjectableCustomerRequestAggregate,
  run: StoredRouteRunProjection,
): CustomerRequestActionResult {
  const criteria = projectCustomerCriteria(aggregate.evaluation.criteria)
  const result = run.resultJson === undefined ? undefined : parseBoundedJson(run.resultJson)
  if ((run.state === 'completed' || run.state === 'failed' || run.state === 'outcome_unknown')
    && run.businesses === undefined) {
    return projectNeedsAttention({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      summary: 'AE could not verify which businesses handled this earlier run. The result has not been changed.',
    })
  }
  if (run.state === 'completed' && result !== undefined) {
    return projectCustomerActionStatus({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      ...(run.businesses === undefined ? {} : { businesses: run.businesses }),
      status: {
        kind: 'completed', resolution: 'provider_result', result,
        resolvedAt: run.updatedAt, automaticRetry: false,
      },
    })
  }
  if (run.state === 'outcome_unknown') {
    return projectCustomerActionStatus({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      ...(run.businesses === undefined ? {} : { businesses: run.businesses }),
      routeProgress: {
        completed: run.completedSteps, total: run.totalSteps, currentStep: run.currentPosition,
      },
      status: {
        kind: 'unknown', reason: 'provider_outcome_unconfirmed',
        ...(isPartialRouteResult(result) ? { partialResult: result } : {}),
        observedAt: run.updatedAt, automaticRetry: false,
      },
    })
  }
  if (run.state === 'cancelled') {
    return projectRouteCancelled({
      requestRef: run.requestId,
      revision: run.requestRevision,
      ...(run.businesses === undefined ? {} : { businesses: run.businesses }),
      routeProgress: {
        completed: run.completedSteps,
        total: run.totalSteps,
        currentStep: Math.min(run.completedSteps + 1, run.totalSteps),
      },
      criteria,
      updatedAt: run.updatedAt,
    })
  }
  if (run.state === 'failed' && result !== undefined) {
    const providerReportedFailure = isProviderReportedRouteFailure(result)
    return projectCustomerActionStatus({
      requestRef: run.requestId,
      revision: run.requestRevision,
      criteria,
      ...(run.businesses === undefined ? {} : { businesses: run.businesses }),
      routeProgress: {
        completed: run.completedSteps, total: run.totalSteps, currentStep: run.currentPosition,
      },
      status: {
        kind: 'failed', resolution: providerReportedFailure ? 'reconciled' : 'not_sent',
        result: providerReportedFailure ? result : { reason: 'business_contact_not_started' },
        resolvedAt: run.updatedAt, automaticRetry: false,
      },
    })
  }
  if (run.state === 'failed') {
    return projectNeedsAttention({
      requestRef: run.requestId, revision: run.requestRevision, criteria,
      summary: 'This request needs attention before it can continue.',
    })
  }
  return projectRouteProgress({
    requestRef: run.requestId,
    revision: run.requestRevision,
    generationRef: run.generationRef,
    completed: run.completedSteps,
    total: run.totalSteps,
    current: { step: run.currentPosition, state: customerProgressState(run.currentState) },
    updatedAt: run.updatedAt,
    cancellationAvailable: run.currentState === 'queued',
    ...(run.cancellationReleaseMayStartAt === undefined
      ? {}
      : { cancellationReleaseMayStartAt: run.cancellationReleaseMayStartAt }),
    ...(run.cancellationUnavailableSince === undefined
      ? {}
      : { cancellationUnavailableSince: run.cancellationUnavailableSince }),
    ...(run.cancellationRequestedAt === undefined
      ? {}
      : { cancellationRequestedAt: run.cancellationRequestedAt }),
    ...(run.cancellationAttempt === undefined
      ? {}
      : { cancellationAttempt: run.cancellationAttempt }),
    ...(run.businesses === undefined ? {} : { businesses: run.businesses }),
    criteria,
  })
}
