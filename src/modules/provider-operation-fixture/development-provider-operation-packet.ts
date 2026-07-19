import type { ActionResult } from '@/modules/common/action'
import type { AnyAction } from '@/modules/common/action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
} from '@/modules/action-invocation'
import type { ProviderOperationInvocationRun } from './development-provider-operation-runner'

export function projectDurableRun<Result extends ActionResult>(
  run: ProviderOperationInvocationRun<Result & (
    import('./development-provider-operation.actions').DevelopmentProviderOperationResult |
    import('./development-provider-operation.actions').DevelopmentProviderOperationCancellationResult
  )>,
) {
  return {
    controls: [...run.state.controls.values()],
    attempts: [...(run.state.attempts.get(run.view.invocationRef)?.values() ?? [])],
    history: run.state.history.get(run.view.invocationRef) ?? [],
    source: {
      input: run.source.input,
      prepared: run.source.prepared,
      result: run.source.result,
      resultIdentity: run.source.resultIdentity,
    },
  }
}

export function reconstructDevelopmentProviderOperationInvocation(input: Readonly<{
  invocationRef: string
  action: AnyAction
  durable: ReturnType<typeof projectDurableRun>
}>) {
  const state = createDevelopmentDurableState<any>()
  for (const control of input.durable.controls) state.controls.set(control.invocationRef, control as never)
  for (const attempt of input.durable.attempts) {
    const rows = state.attempts.get(attempt.invocationRef) ?? new Map()
    rows.set(attempt.attemptRef, attempt)
    state.attempts.set(attempt.invocationRef, rows)
  }
  state.history.set(input.invocationRef, [...input.durable.history])
  const source = structuredClone(input.durable.source)
  const tracer = createDurableActionInvocationTracer({
    action: input.action as never,
    port: createDevelopmentDurablePort(state),
    now: () => '2026-07-19T04:00:00.000Z',
    nextInvocationRef: () => 'cold_reconstruction_must_not_create_invocation',
    nextAuthorityRef: () => 'cold_reconstruction_must_not_create_authority',
    nextAttemptRef: () => 'cold_reconstruction_must_not_create_attempt',
    resolveSourceState: () => ({
      input: source.input,
      context: {},
      prepared: source.prepared,
      observedResolution: source.result === undefined
        ? { state: 'pending' as const }
        : {
            state: 'returned' as const,
            execution: 'runner_returned' as const,
            businessOutcome: source.result.kind.includes('confirmed') ? 'completed' : 'refused',
            resultReferenceable: source.result.kind.includes('confirmed'),
            result: source.result,
          },
      ...(source.resultIdentity === undefined ? {} : { resultIdentity: source.resultIdentity }),
    }),
  })
  const view = tracer.coldResume(input.invocationRef).inspect(input.invocationRef)
  if (view === undefined) throw new Error('development_provider_operation_cold_reconstruction_failed')
  return { view, state }
}
