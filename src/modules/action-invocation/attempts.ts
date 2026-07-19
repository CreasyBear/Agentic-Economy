import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionAttemptView, InvocationActor } from './contracts'

export type DevelopmentReleaseSignal = {
  beginAttempt(): void
  markReleased(): void
  wasReleased(): boolean
}

export function createDevelopmentReleaseSignal(): DevelopmentReleaseSignal {
  let released = false
  return {
    beginAttempt: () => { released = false },
    markReleased: () => { released = true },
    wasReleased: () => released,
  }
}

export function createAttempt(input: Readonly<{
  actionId: string
  attemptRef: string
  attemptNumber: number
  actor: InvocationActor
  operationKey: string
  materialInputDigest: string
  effectGeneration: number
  leaseOwner: string
  leaseExpiresAt: string
}>): ActionAttemptView {
  return {
    attemptRef: input.attemptRef,
    attemptNumber: input.attemptNumber,
    actor: input.actor,
    effectGeneration: input.effectGeneration,
    lease: { owner: input.leaseOwner, expiresAt: input.leaseExpiresAt },
    idempotency: {
      operationKey: input.operationKey,
      materialInputDigest: input.materialInputDigest,
      effectIdentity: canonicalDigest({
        actionId: input.actionId,
        operationKey: input.operationKey,
        materialInputDigest: input.materialInputDigest,
      }),
    },
    release: { state: 'not_released' },
    outcome: { state: 'running' },
  }
}

export function replaceAttempt(
  attempts: readonly ActionAttemptView[],
  next: ActionAttemptView,
): readonly ActionAttemptView[] {
  return attempts.map((attempt) => attempt.attemptRef === next.attemptRef ? next : attempt)
}

export function reconcileAttempt(
  attempt: ActionAttemptView,
  resolution: 'not_released' | 'released',
  observedAt: string,
): ActionAttemptView {
  return resolution === 'not_released'
    ? {
        ...attempt,
        release: { state: 'not_released' },
        outcome: { state: 'reconciled_not_released', retry: 'safe_after_reconciliation', observedAt },
      }
    : {
        ...attempt,
        release: { state: 'released', observedAt },
        outcome: { state: 'reconciled_released', externalOutcome: 'unknown', observedAt },
      }
}
