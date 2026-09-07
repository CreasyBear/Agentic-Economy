import type { ActionResult } from '../../../../src/modules/common/action'
import type { AnyAction } from '../../../../src/modules/common/action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
} from '../../../../src/modules/action-execution'
import type { ProviderToolExecutionRun } from './development-provider-tool-runner'

export function projectDurableRun<Result extends ActionResult>(
  run: ProviderToolExecutionRun<Result & (
    import('./development-provider-tool.actions').DevelopmentProviderToolResult |
    import('./development-provider-tool.actions').DevelopmentProviderToolCancellationResult
  )>,
) {
  return {
    controls: [...run.state.controls.values()],
    attempts: [...(run.state.attempts.get(run.view.executionRef)?.values() ?? [])],
    history: run.state.history.get(run.view.executionRef) ?? [],
    source: {
      input: run.source.input,
      prepared: run.source.prepared,
      result: run.source.result,
      resultIdentity: run.source.resultIdentity,
    },
  }
}

export async function reconstructDevelopmentProviderToolExecution(input: Readonly<{
  executionRef: string
  action: AnyAction
  durable: ReturnType<typeof projectDurableRun>
}>) {
  const state = createDevelopmentDurableState<any>()
  for (const control of input.durable.controls) state.controls.set(control.executionRef, control as never)
  for (const attempt of input.durable.attempts) {
    const rows = state.attempts.get(attempt.executionRef) ?? new Map()
    rows.set(attempt.attemptRef, attempt)
    state.attempts.set(attempt.executionRef, rows)
  }
  state.history.set(input.executionRef, [...input.durable.history])
  const source = structuredClone(input.durable.source)
  const tracer = createDurableActionExecutionTracer({
    action: input.action as never,
    port: createDevelopmentDurablePort(state),
    now: () => '2026-07-19T04:00:00.000Z',
    nextExecutionRef: () => 'cold_reconstruction_must_not_create_invocation',
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
  const resumed = await tracer.coldResume(input.executionRef)
  const view = resumed.inspect(input.executionRef)
  if (view === undefined) throw new Error('development_provider_operation_cold_reconstruction_failed')
  return { view, state }
}
