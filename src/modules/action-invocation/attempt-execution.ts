import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type { ActionInvocationView } from './contracts'
import {
  replaceAttempt,
  type DevelopmentReleaseSignal,
  type DevelopmentTimeoutSignal,
} from './attempts'
import { classifyActionResult } from './preparation'

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
  timeoutSignal?: DevelopmentTimeoutSignal
  timeoutMs?: number
  attempt: ActionInvocationView<Result>['attempts'][number]
}>): Promise<AttemptTransition<Result>> {
  const prepared = input.currentView.prepared
  if (prepared === undefined) throw new Error('Consequential attempt requires prepared invocation state.')
  input.releaseSignal?.beginAttempt()
  const attempt = input.attempt
  const attempts = input.currentView.attempts

  try {
    const runner = input.action.run({ data: input.actionInput, context: input.context })
    // The timeout bounds the control decision only. It does not cancel or erase
    // the runner promise; completion is fenced from mutating the advanced view.
    const timeoutMs = input.timeoutMs
    const result = input.timeoutSignal === undefined || timeoutMs === undefined
      ? await runner
      : await Promise.race([
          runner,
          input.timeoutSignal.wait(timeoutMs).then(() => {
            throw new AttemptTimeout(timeoutMs)
          }),
        ])
    const classification = classifyActionResult(input.action, result)
    const execution = input.action.classifyInvocationExecution?.(result)
    if (execution?.release === 'not_released') {
      return {
        attempts: replaceAttempt(attempts, {
          ...attempt,
          release: { state: 'not_released' },
          outcome: {
            state: 'failed',
            retry: 'safe_before_release',
            message: execution.message,
          },
        }),
        observedResolution: {
          state: 'returned',
          execution: 'pre_release_refused',
          businessOutcome: execution.outcome,
          resultReferenceable: execution.referenceable,
          result,
        },
        freshness: { state: 'current', observedAt: input.now() },
        control: { state: 'retryable', reason: 'pre_release_failure' },
      }
    }
    const returnedAttempt = {
      ...attempt,
      release: input.releaseSignal?.wasReleased()
        ? { state: 'released' as const, observedAt: input.now() }
        : { state: 'possibly_released' as const },
      outcome: { state: 'returned' as const, businessOutcome: classification.outcome },
    }
    return {
      attempts: replaceAttempt(attempts, returnedAttempt),
      observedResolution: {
        state: 'returned',
        execution: 'runner_returned',
        businessOutcome: classification.outcome,
        resultReferenceable: classification.referenceable,
        result,
      },
      freshness: { state: 'current', observedAt: input.now() },
      control: { state: 'terminal' },
    }
  } catch (error) {
    if (error instanceof AttemptTimeout) {
      const reconciliationRequiredAt = input.now()
      const timedOutAttempt = {
        ...attempt,
        release: { state: 'possibly_released' as const },
        outcome: {
          state: 'timed_out' as const,
          timeoutMs: error.timeoutMs,
          retry: 'reconcile_before_retry' as const,
          reconciliationRequiredAt,
        },
      }
      return {
        attempts: replaceAttempt(attempts, timedOutAttempt),
        observedResolution: {
          state: 'timed_out',
          timeoutMs: error.timeoutMs,
          observedAt: input.now(),
        },
        freshness: { state: 'current', observedAt: input.now() },
        control: { state: 'reconciliation_required', attemptRef: attempt.attemptRef },
      }
    }
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
          outcome: {
            state: 'uncertain' as const,
            retry: 'reconcile_before_retry' as const,
            message,
            reconciliationRequiredAt: input.now(),
          },
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

class AttemptTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Action attempt exceeded its declared ${timeoutMs}ms timeout.`)
  }
}
