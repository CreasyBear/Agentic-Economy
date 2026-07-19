import type {
  ActionAttemptView,
  ActionInvocationView,
  DecisionRefusalCode,
} from './contracts'
import { createAttempt, replaceAttempt } from './attempts'

export type LeaseToken = Readonly<{
  attemptRef: string
  leaseOwner: string
  effectGeneration: number
  leaseExpiresAt: string
}>

export function nextEffectGeneration(attempts: readonly ActionAttemptView[]): number {
  return Math.max(0, ...attempts.map(({ effectGeneration }) => effectGeneration)) + 1
}

export function currentLease<Result extends { kind: string }>(
  view: ActionInvocationView<Result>,
  token: Omit<LeaseToken, 'leaseExpiresAt'>,
): DecisionRefusalCode | undefined {
  const control = view.control
  if (control.state !== 'leased') {
    return 'lease_not_current'
  }
  if (control.effectGeneration !== token.effectGeneration) {
    return 'effect_generation_stale'
  }
  if (control.attemptRef !== token.attemptRef || control.leaseOwner !== token.leaseOwner) {
    return 'lease_not_current'
  }
  return undefined
}

export function leaseIsExpired(
  control: Extract<ActionInvocationView['control'], { state: 'leased' }>,
  now: string,
): boolean {
  return Date.parse(now) >= Date.parse(control.leaseExpiresAt)
}

export function acquireLease<Result extends { kind: string }>(input: Readonly<{
  view: ActionInvocationView<Result>
  actionId: string
  attemptRef: string
  operationKey: string
  materialInputDigest: string
  leaseOwner: string
  leaseExpiresAt: string
}>): ActionInvocationView<Result> {
  const effectGeneration = nextEffectGeneration(input.view.attempts)
  const attempt = createAttempt({
    actionId: input.actionId,
    attemptRef: input.attemptRef,
    attemptNumber: input.view.attempts.length + 1,
    actor: input.view.owner,
    operationKey: input.operationKey,
    materialInputDigest: input.materialInputDigest,
    effectGeneration,
    leaseOwner: input.leaseOwner,
    leaseExpiresAt: input.leaseExpiresAt,
  })
  return {
    ...input.view,
    invocationVersion: input.view.invocationVersion + 1,
    attempts: [...input.view.attempts, attempt],
    control: {
      state: 'leased',
      attemptRef: attempt.attemptRef,
      leaseOwner: input.leaseOwner,
      effectGeneration,
      leaseExpiresAt: input.leaseExpiresAt,
      release: 'not_started',
    },
  }
}

export function publishLeaseObservation<Result extends { kind: string }>(input: Readonly<{
  view: ActionInvocationView<Result>
  attemptRef: string
  release: 'not_released' | 'released' | 'possibly_released'
  observedAt: string
}>): ActionInvocationView<Result> | undefined {
  const attempt = input.view.attempts.find(({ attemptRef }) => attemptRef === input.attemptRef)
  if (attempt === undefined) return undefined
  const nextAttempt = input.release === 'not_released'
    ? { ...attempt, release: { state: 'not_released' as const }, outcome: { state: 'failed' as const, retry: 'safe_before_release' as const, message: 'Worker observed no release.' } }
    : input.release === 'released'
      ? { ...attempt, release: { state: 'released' as const, observedAt: input.observedAt }, outcome: { state: 'reconciled_released' as const, externalOutcome: 'unknown' as const, observedAt: input.observedAt } }
      : {
          ...attempt,
          release: { state: 'possibly_released' as const },
          outcome: {
            state: 'uncertain' as const,
            retry: 'reconcile_before_retry' as const,
            message: 'Worker could not prove release outcome.',
            reconciliationRequiredAt: input.observedAt,
          },
        }
  return {
    ...input.view,
    invocationVersion: input.view.invocationVersion + 1,
    attempts: replaceAttempt(input.view.attempts, nextAttempt),
    freshness: { state: 'current', observedAt: input.observedAt },
    control: input.release === 'not_released'
      ? { state: 'retryable', reason: 'pre_release_failure' }
      : input.release === 'released'
        ? { state: 'terminal' }
        : { state: 'reconciliation_required', attemptRef: input.attemptRef },
  }
}
