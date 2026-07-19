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
  Omit<DurableTracerOptions<Input, Result>, 'port'> & Readonly<{
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

/**
 * Async runtime adapter for Convex-backed control. The transition engine is the
 * same source owner as the in-memory adapter; a transition becomes caller
 * visible only after the async transaction accepts it.
 */
export async function createAsyncDurableActionInvocationTracer<
  Input,
  Result extends ActionResult,
>(
  options: AsyncDurableTracerOptions<Input, Result>,
  resumeInvocationRef?: string,
): Promise<AsyncDurableActionInvocationTracer<Input, Result>> {
  let state = createDevelopmentDurableState<Result>()
  if (resumeInvocationRef !== undefined) state = await loadState(options.port, resumeInvocationRef)
  let currentInvocationRef = resumeInvocationRef
  let pending: PersistControlCommand<Result> | undefined

  const makeTracer = (): DurableActionInvocationTracer<Input, Result> => {
    const cache = createDevelopmentDurablePort(state)
    const capture: DurableActionInvocationPort<Result> = {
      ...cache,
      transact(command) {
        pending = command
        return cache.transact(command)
      },
    }
    return createDurableActionInvocationTracer(
      { ...options, port: capture },
      currentInvocationRef,
    )
  }
  let tracer = makeTracer()

  const commit = async (
    decision: InvocationDecision<Result>,
  ): Promise<InvocationDecision<Result>> => {
    if (decision.kind !== 'accepted' || pending === undefined) return decision
    const result = await options.port.transact(pending)
    pending = undefined
    if (result.kind !== 'refused') return decision
    state = await loadState(options.port, decision.view.invocationRef)
    currentInvocationRef = decision.view.invocationRef
    tracer = makeTracer()
    const current = tracer.inspect(decision.view.invocationRef)
    return current === undefined
      ? { kind: 'refused', code: result.code }
      : { kind: 'refused', code: result.code, view: current }
  }

  const commitView = async (
    view: ActionInvocationView<Result>,
  ): Promise<ActionInvocationView<Result>> => {
    if (pending === undefined) return view
    const result = await options.port.transact(pending)
    pending = undefined
    if (result.kind === 'refused') {
      state = await loadState(options.port, view.invocationRef)
      currentInvocationRef = view.invocationRef
      tracer = makeTracer()
      throw new Error(`Durable transaction refused: ${result.code}`)
    }
    currentInvocationRef = view.invocationRef
    return view
  }

  return {
    invoke: async (input) => commitView(await tracer.invoke(input)),
    prepare: async (input) => commitView(tracer.prepare(input)),
    decide: async (input) => commit(tracer.decide(input)),
    execute: async (input) => commit(await tracer.execute(input)),
    acquire: async (input) => commit(tracer.acquire(input)),
    executeAcquired: async (input) => commit(await tracer.executeAcquired(input)),
    publishObservation: async (input) => commit(tracer.publishObservation(input)),
    cancel: async (input) => commit(tracer.cancel(input)),
    reconcile: async (input) => commit(tracer.reconcile(input)),
    inspect: async (invocationRef) => tracer.inspect(invocationRef),
    exportSnapshot: async () => tracer.exportSnapshot(),
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
