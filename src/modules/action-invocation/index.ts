import {
  resolveActionContract,
  type Action,
  type ActionContext,
  type ActionResult,
} from '@/modules/common/action'

export type ActionInvocationOrigin =
  | Readonly<{
      kind: 'request_owned'
      requestRef: string
      revision: number
    }>
  | Readonly<{
      kind: 'standalone'
      callerRef: string
      principalRef: string
    }>

export type ActionInvocationView<Result extends ActionResult = ActionResult> = Readonly<{
  invocationRef: string
  invocationVersion: 1
  origin: ActionInvocationOrigin
  action: Readonly<{
    id: string
    contractVersion: string
  }>
  desired: Readonly<{ state: 'invoke' }>
  observedResolution:
    | Readonly<{ state: 'pending' }>
    | Readonly<{ state: 'succeeded'; result: Result }>
  freshness:
    | Readonly<{ state: 'not_observed' }>
    | Readonly<{ state: 'current'; observedAt: string }>
  control:
    | Readonly<{ state: 'in_progress' }>
    | Readonly<{ state: 'terminal' }>
}>

export type InvokeActionInput<Input> = Readonly<{
  origin: ActionInvocationOrigin
  input: Input
  context: ActionContext
}>

export interface ActionInvocationTracer<Input, Result extends ActionResult> {
  invoke(input: InvokeActionInput<Input>): Promise<ActionInvocationView<Result>>
  inspect(invocationRef: string): ActionInvocationView<Result> | undefined
}

type InMemoryTracerOptions<Input, Result extends ActionResult> = Readonly<{
  action: Action<Input, Result>
  now: () => string
  nextInvocationRef: () => string
}>

/**
 * Development tracer only. It executes the registered action runner and keeps
 * its control projection in process memory; it creates no durable record,
 * authority, attempt, retry, or external-effect claim.
 */
export function createInMemoryActionInvocationTracer<
  Input,
  Result extends ActionResult,
>(
  options: InMemoryTracerOptions<Input, Result>,
): ActionInvocationTracer<Input, Result> {
  const views = new Map<string, ActionInvocationView<Result>>()
  const contract = resolveActionContract(options.action)

  return {
    async invoke({ origin, input, context }) {
      const invocationRef = options.nextInvocationRef()
      const initial: ActionInvocationView<Result> = {
        invocationRef,
        invocationVersion: 1,
        origin,
        action: {
          id: options.action.id,
          contractVersion: contract.version,
        },
        desired: { state: 'invoke' },
        observedResolution: { state: 'pending' },
        freshness: { state: 'not_observed' },
        control: { state: 'in_progress' },
      }
      views.set(invocationRef, initial)

      const result = await options.action.run({ data: input, context })
      const current: ActionInvocationView<Result> = {
        ...initial,
        observedResolution: { state: 'succeeded', result },
        freshness: { state: 'current', observedAt: options.now() },
        control: { state: 'terminal' },
      }
      views.set(invocationRef, current)
      return current
    },
    inspect(invocationRef) {
      return views.get(invocationRef)
    },
  }
}
