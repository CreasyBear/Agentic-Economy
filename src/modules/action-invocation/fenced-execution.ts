import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type {
  ActionInvocationView,
  DecisionRefusalCode,
  InvocationDecision,
} from './contracts'
import type { DevelopmentReleaseSignal } from './attempts'
import { executeConsequentialAttempt } from './attempt-execution'
import { currentLease, leaseIsExpired } from './lease-control'

export async function executeAcquiredAttempt<Input, Result extends ActionResult>(input: Readonly<{
  action: Action<Input, Result>
  actionInput: Input
  context: ActionContext
  view: ActionInvocationView<Result>
  expectedInvocationVersion: number
  attemptRef: string
  leaseOwner: string
  effectGeneration: number
  operationKey: string
  now: () => string
  releaseSignal?: DevelopmentReleaseSignal
}>): Promise<InvocationDecision<Result>> {
  if (input.view.invocationVersion !== input.expectedInvocationVersion) {
    return { kind: 'refused', code: 'stale_invocation_version', view: input.view }
  }
  const refusal = currentLease(input.view, input)
  if (refusal !== undefined) return { kind: 'refused', code: refusal, view: input.view }
  if (input.view.control.state !== 'leased' || leaseIsExpired(input.view.control, input.now())) {
    return refusalAfterExpiry(input.view, input.attemptRef)
  }
  const attempt = input.view.attempts.find(({ attemptRef }) => attemptRef === input.attemptRef)
  if (attempt === undefined) {
    return { kind: 'refused', code: 'invalid_control_state', view: input.view }
  }
  const releasing = nextView(input.view, {
    control: { ...input.view.control, release: 'possibly_released' },
  })
  const transition = await executeConsequentialAttempt({
    action: input.action,
    actionInput: input.actionInput,
    context: input.context,
    currentView: releasing,
    attemptRef: attempt.attemptRef,
    operationKey: input.operationKey,
    now: input.now,
    ...(input.releaseSignal === undefined ? {} : { releaseSignal: input.releaseSignal }),
    attempt,
  })
  return { kind: 'accepted', view: nextView(releasing, transition) }
}

function refusalAfterExpiry<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
  attemptRef: string,
): Readonly<{ kind: 'refused'; code: DecisionRefusalCode; view: ActionInvocationView<Result> }> {
  return {
    kind: 'refused',
    code: 'reconciliation_required',
    view: nextView(view, { control: { state: 'reconciliation_required', attemptRef } }),
  }
}

function nextView<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
  change: Partial<ActionInvocationView<Result>>,
): ActionInvocationView<Result> {
  return { ...view, ...change, invocationVersion: view.invocationVersion + 1 }
}
