import type { ActionResult } from '@/modules/common/action'
import type {
  ActionInvocationTracer,
  ActionInvocationView,
  InvocationDecision,
} from './contracts'
import {
  createDurableActionInvocationTracer,
  type DurableActionInvocationTracer,
  type DurableTracerOptions,
} from './durable'
import type { AsyncDurableActionInvocationPort } from './internal/async-durable-port'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
} from './internal/development-durable-port'
import type {
  DurableActionInvocationPort,
  PersistControlCommand,
  PersistControlResult,
} from './internal/durable-contracts'

export type AsyncDurableTracerOptions<Input, Result extends ActionResult> =
  Omit<DurableTracerOptions<Input, Result>, 'port' | 'flushBeforeEffectRelease'> & Readonly<{
    port: AsyncDurableActionInvocationPort<Result>
  }>

export type AsyncDurableActionInvocationTracer<Input, Result extends ActionResult> = {
  [Key in keyof ActionInvocationTracer<Input, Result>]:
    ActionInvocationTracer<Input, Result>[Key] extends (...args: infer Args) => infer Return
      ? (...args: Args) => Promise<Awaited<Return>>
      : never
} & Readonly<{
  coldResume(invocationRef: string): Promise<AsyncDurableActionInvocationTracer<Input, Result>>
}>

type OperationContext<Input, Result extends ActionResult> = Readonly<{
  tracer: DurableActionInvocationTracer<Input, Result>
  flushNext(): Promise<PersistControlResult | undefined>
  flushRemaining(): Promise<Extract<PersistControlResult, { kind: 'refused' }> | undefined>
}>

/**
 * Async runtime adapter for Convex-backed control. Every public operation owns
 * its capture queue and refusal state. Long-running effects therefore do not
 * serialize unrelated invocations or share mutable persistence slots.
 */
export async function createAsyncDurableActionInvocationTracer<
  Input,
  Result extends ActionResult,
>(
  options: AsyncDurableTracerOptions<Input, Result>,
  boundInvocationRef?: string,
): Promise<AsyncDurableActionInvocationTracer<Input, Result>> {
  const createOperation = async (
    invocationRef?: string,
  ): Promise<OperationContext<Input, Result>> => {
    const state = invocationRef === undefined
      ? createDevelopmentDurableState<Result>()
      : await loadState(options.port, invocationRef)
    const cache = createDevelopmentDurablePort(state)
    const commands: PersistControlCommand<Result>[] = []
    let durableRefusal: Extract<PersistControlResult, { kind: 'refused' }> | undefined
    const capture: DurableActionInvocationPort<Result> = {
      ...cache,
      transact(command) {
        const result = cache.transact(command)
        if (result.kind !== 'refused') commands.push(command)
        return result
      },
    }
    const flushNext = async (): Promise<PersistControlResult | undefined> => {
      if (durableRefusal !== undefined) return durableRefusal
      const command = commands.shift()
      if (command === undefined) return undefined
      const result = await options.port.transact(command)
      if (result.kind === 'refused') durableRefusal = result
      return result
    }
    const tracer = createDurableActionInvocationTracer(
      { ...options, port: capture, flushBeforeEffectRelease: flushNext },
      invocationRef,
    )
    return {
      tracer,
      flushNext,
      async flushRemaining() {
        while (commands.length > 0 && durableRefusal === undefined) await flushNext()
        return durableRefusal
      },
    }
  }

  const currentDecision = async (
    invocationRef: string,
    refusal: Extract<PersistControlResult, { kind: 'refused' }>,
  ): Promise<InvocationDecision<Result>> => {
    const currentOperation = await createOperation(invocationRef)
    const current = currentOperation.tracer.inspect(invocationRef)
    return current === undefined
      ? { kind: 'refused', code: refusal.code }
      : { kind: 'refused', code: refusal.code, view: current }
  }

  const finishDecision = async (
    operation: OperationContext<Input, Result>,
    invocationRef: string,
    decision: InvocationDecision<Result>,
  ): Promise<InvocationDecision<Result>> => {
    const refusal = await operation.flushRemaining()
    return refusal === undefined ? decision : currentDecision(invocationRef, refusal)
  }

  const finishView = async (
    operation: OperationContext<Input, Result>,
    view: ActionInvocationView<Result>,
  ): Promise<ActionInvocationView<Result>> => {
    const refusal = await operation.flushRemaining()
    if (refusal !== undefined) {
      throw new Error(`Durable transaction refused: ${refusal.code}`)
    }
    return view
  }

  const existingOperation = async <Value>(
    invocationRef: string,
    run: (tracer: DurableActionInvocationTracer<Input, Result>) => Value | Promise<Value>,
  ): Promise<Readonly<{ operation: OperationContext<Input, Result>; value: Awaited<Value> }>> => {
    if (boundInvocationRef !== undefined && boundInvocationRef !== invocationRef) {
      throw new Error(`Tracer is bound to ${boundInvocationRef}, not ${invocationRef}.`)
    }
    const operation = await createOperation(invocationRef)
    return { operation, value: await run(operation.tracer) }
  }

  return {
    async invoke(input) {
      const operation = await createOperation()
      return finishView(operation, await operation.tracer.invoke(input))
    },
    async prepare(input) {
      const operation = await createOperation()
      return finishView(operation, operation.tracer.prepare(input))
    },
    async decide(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.decide(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async execute(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.execute(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async acquire(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.acquire(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async executeAcquired(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.executeAcquired(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async publishObservation(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.publishObservation(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async cancel(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.cancel(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async reconcile(input) {
      const { operation, value } = await existingOperation(
        input.invocationRef,
        (tracer) => tracer.reconcile(input),
      )
      return finishDecision(operation, input.invocationRef, value)
    },
    async inspect(invocationRef) {
      const { value } = await existingOperation(
        invocationRef,
        (tracer) => tracer.inspect(invocationRef),
      )
      return value
    },
    async exportSnapshot() {
      if (boundInvocationRef === undefined) {
        throw new Error('Async snapshot export requires coldResume(invocationRef).')
      }
      const operation = await createOperation(boundInvocationRef)
      return operation.tracer.exportSnapshot()
    },
    coldResume: (invocationRef) => createAsyncDurableActionInvocationTracer(options, invocationRef),
  }
}

async function loadState<Result extends ActionResult>(
  port: AsyncDurableActionInvocationPort<Result>,
  invocationRef: string,
) {
  const state = createDevelopmentDurableState<Result>()
  const control = await port.readControl(invocationRef)
  if (control === undefined) throw new Error(`Missing durable invocation ${invocationRef}.`)
  state.controls.set(invocationRef, control)
  const attempts = new Map()
  let attemptCursor: string | null = null
  do {
    const page = await port.readAttempts({ invocationRef, cursor: attemptCursor, numItems: 100 })
    for (const attempt of page.page) attempts.set(attempt.attemptRef, attempt)
    attemptCursor = page.isDone ? null : page.continueCursor
  } while (attemptCursor !== null)
  state.attempts.set(invocationRef, attempts)
  if (control.currentAttemptRef !== undefined && !attempts.has(control.currentAttemptRef)) {
    const currentAttempt = await port.readAttempt(invocationRef, control.currentAttemptRef)
    if (currentAttempt !== undefined) attempts.set(currentAttempt.attemptRef, currentAttempt)
  }
  const history = []
  let historyCursor: string | null = null
  do {
    const page = await port.readHistory({ invocationRef, cursor: historyCursor, numItems: 100 })
    history.push(...page.page)
    historyCursor = page.isDone ? null : page.continueCursor
  } while (historyCursor !== null)
  state.history.set(invocationRef, history)
  return state
}

export type { AsyncDurableActionInvocationPort, PersistControlResult }
