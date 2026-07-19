import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type { ActionInvocationView } from './contracts'
import {
  createAttempt,
  replaceAttempt,
  type DevelopmentReleaseSignal,
} from './attempts'
import { classifyBusinessOutcome } from './preparation'

type AttemptTransition<Result extends ActionResult> = Pick<
  ActionInvocationView<Result>,
  'attempts' | 'observedResolution' | 'freshness' | 'control'
>

export async function executeConsequentialAttempt<Input, Result extends ActionResult>(input: Readonly<{
  action: Action<Input, Result>
  actionInput: Input
  context: ActionContext
  currentView: ActionInvocationView<Result>
  attemptRef: string
  operationKey: string
  now: () => string
  releaseSignal?: DevelopmentReleaseSignal
}>): Promise<AttemptTransition<Result>> {
  const prepared = input.currentView.prepared
  if (prepared === undefined) throw new Error('Consequential attempt requires prepared invocation state.')
  input.releaseSignal?.beginAttempt()
  const attempt = createAttempt({
    actionId: input.action.id,
    attemptRef: input.attemptRef,
    attemptNumber: input.currentView.attempts.length + 1,
    actor: input.currentView.owner,
    operationKey: input.operationKey,
    materialInputDigest: prepared.materialInputDigest,
  })
  const attempts = [...input.currentView.attempts, attempt]

  try {
    const result = await input.action.run({ data: input.actionInput, context: input.context })
    const businessOutcome = classifyBusinessOutcome(result)
    const returnedAttempt = {
      ...attempt,
      release: input.releaseSignal?.wasReleased()
        ? { state: 'released' as const, observedAt: input.now() }
        : { state: 'possibly_released' as const },
      outcome: { state: 'returned' as const, businessOutcome },
    }
    return {
      attempts: replaceAttempt(attempts, returnedAttempt),
      observedResolution: {
        state: 'returned',
        execution: 'runner_returned',
        businessOutcome,
        result,
      },
      freshness: { state: 'current', observedAt: input.now() },
      control: { state: 'terminal' },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runner failure'
    const explicitlyNotReleased = input.releaseSignal !== undefined && !input.releaseSignal.wasReleased()
    const failedAttempt = explicitlyNotReleased
      ? {
          ...attempt,
          release: { state: 'not_released' as const },
          outcome: { state: 'failed' as const, retry: 'safe_before_release' as const, message },
        }
      : {
          ...attempt,
          release: { state: 'possibly_released' as const },
          outcome: { state: 'uncertain' as const, retry: 'reconcile_before_retry' as const, message },
        }
    return {
      attempts: replaceAttempt(attempts, failedAttempt),
      observedResolution: { state: 'threw', execution: 'runner_threw', message },
      freshness: { state: 'current', observedAt: input.now() },
      control: explicitlyNotReleased
        ? { state: 'retryable', reason: 'pre_release_failure' }
        : { state: 'reconciliation_required', attemptRef: attempt.attemptRef },
    }
  }
}
