import type { RouteAttemptState } from './export-state'
import {
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
  type RouteAttemptIntegritySnapshot,
  type RouteDispatchIntegritySnapshot,
} from './integrity'

export type CancelMode = 'current_and_downstream' | 'after_current_step'

export type CancelOutboxState =
  | 'pending'
  | 'leased'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'outcome_unknown'

export type CancelDisposition = 'cancelled' | 'pending' | 'too_late'

export type CancelReplayKind = 'replayed' | 'pending' | 'too_late'

export type RecoverExpiredDispatchKind = 'requeued' | 'outcome_unknown' | 'unchanged'

export type SucceededOutcomeBranch =
  | 'pending_cancellation_replay'
  | 'too_late_cancellation'
  | 'complete_final_step'
  | 'advance_or_unknown'

export function decideSucceededOutcomeBranch(input: Readonly<{
  attemptPosition: number
  totalSteps: number
  cancellationResult: string | null | undefined
}>): SucceededOutcomeBranch {
  if (input.attemptPosition < input.totalSteps && input.cancellationResult === 'pending') {
    return 'pending_cancellation_replay'
  }
  if (input.attemptPosition < input.totalSteps && input.cancellationResult === 'too_late') {
    return 'too_late_cancellation'
  }
  if (input.attemptPosition === input.totalSteps) {
    return 'complete_final_step'
  }
  return 'advance_or_unknown'
}

export function cancelCommandArgsConflict(args: Readonly<{
  idempotencyKey: string
  principalId: string
}>): boolean {
  return args.idempotencyKey.trim().length === 0 || args.principalId.trim().length === 0
}

export function cancelPriorCommandConflicts(input: Readonly<{
  prior: Readonly<{
    commandDigest: string
    principalId: string
    requestId: string
    mode?: CancelMode
  }>
  args: Readonly<{
    requestId: string
    principalId: string
    mode: CancelMode
  }>
  commandDigest: string
  historicalDefaultDigest: string
}>): boolean {
  const { prior, args, commandDigest, historicalDefaultDigest } = input
  const digestMatches = prior.commandDigest === commandDigest
    || (prior.mode === undefined && args.mode === 'current_and_downstream'
      && prior.commandDigest === historicalDefaultDigest)
  return !digestMatches
    || prior.principalId !== args.principalId
    || prior.requestId !== args.requestId
}

export function cancelReplayKind(priorResult: CancelDisposition): CancelReplayKind {
  return priorResult === 'cancelled'
    ? 'replayed'
    : priorResult === 'pending'
      ? 'pending'
      : 'too_late'
}

export function cancelRunNotFound(
  head: Readonly<{ principalId: string }> | null,
  principalId: string,
): boolean {
  return head === null || head.principalId !== principalId
}

export function cancelRunHeadIntegrityValid(
  run: Readonly<{ mandateRef: string }> | null,
  head: Readonly<{ currentMandateRef: string }>,
): boolean {
  return run !== null && run.mandateRef === head.currentMandateRef
}

export function canPreReleaseCancel(input: Readonly<{
  attemptState: RouteAttemptState
  outboxState: CancelOutboxState
}>): boolean {
  return (input.attemptState === 'queued' || input.attemptState === 'leased')
    && (input.outboxState === 'pending' || input.outboxState === 'leased')
}

export function canRequestAdapterCancellation(input: Readonly<{
  canPreReleaseCancel: boolean
  mode: CancelMode
  attemptState: RouteAttemptState
  cancellationKind: string
}>): boolean {
  return !input.canPreReleaseCancel
    && input.mode === 'current_and_downstream'
    && input.cancellationKind === 'adapter_managed'
    && (input.attemptState === 'dispatched' || input.attemptState === 'accepted')
}

export function cancelDisposition(input: Readonly<{
  canPreReleaseCancel: boolean
  canRequestAdapterCancellation: boolean
}>): CancelDisposition {
  return input.canPreReleaseCancel
    ? 'cancelled'
    : input.canRequestAdapterCancellation
      ? 'pending'
      : 'too_late'
}

export function leaseArgsInvalid(args: Readonly<{
  workerId: string
  leaseDurationMs: number
}>): boolean {
  return args.workerId.trim().length === 0
    || !Number.isSafeInteger(args.leaseDurationMs)
    || args.leaseDurationMs < 1_000
    || args.leaseDurationMs > 60_000
}

export function leasePendingCandidateValid(input: Readonly<{
  attempt: (RouteAttemptIntegritySnapshot & Readonly<{
    state: RouteAttemptState
  }>) | null
  dispatch: RouteDispatchIntegritySnapshot & Readonly<{
    runRef: string
    operationKeyDigest: string
  }>
}>): boolean {
  const { attempt, dispatch } = input
  return attempt !== null
    && routeDispatchIntegrityValid(dispatch)
    && routeAttemptIntegrityValid(attempt)
    && attempt.runRef === dispatch.runRef
    && attempt.state === 'queued'
    && attempt.operationKeyDigest === dispatch.operationKeyDigest
}

export function leaseGrantExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now
}

export function recoverDispatchLeaseStillCurrent(
  dispatch: Readonly<{ leaseExpiresAt?: number }> | null,
  now: number,
): boolean {
  return dispatch === null
    || dispatch.leaseExpiresAt === undefined
    || dispatch.leaseExpiresAt > now
}

export function recoverDispatchAttemptAligned(input: Readonly<{
  attempt: Readonly<{ runRef: string; operationKeyDigest: string }> | null
  dispatch: Readonly<{ runRef: string; operationKeyDigest: string }>
}>): boolean {
  return input.attempt !== null
    && input.attempt.runRef === input.dispatch.runRef
    && input.attempt.operationKeyDigest === input.dispatch.operationKeyDigest
}

export function recoverExpiredDispatchKind(input: Readonly<{
  dispatchState: CancelOutboxState
  attemptState: RouteAttemptState
}>): RecoverExpiredDispatchKind {
  if (input.dispatchState === 'leased' && input.attemptState === 'leased') {
    return 'requeued'
  }
  if (input.dispatchState === 'delivered'
    && (input.attemptState === 'dispatched' || input.attemptState === 'accepted')) {
    return 'outcome_unknown'
  }
  return 'unchanged'
}
