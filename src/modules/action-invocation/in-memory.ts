import {
  resolveActionContract,
  type Action,
  type ActionContext,
  type ActionResult,
} from '@/modules/common/action'
import type {
  ActionInvocationOrigin,
  ActionInvocationTracer,
  ActionInvocationView,
  DecisionRefusalCode,
  InvocationActor,
  InvocationDecision,
  PreparedInvocation,
} from './contracts'
import {
  actorFromOrigin,
  classifyBusinessOutcome,
  dataUseFor,
  materialDigest,
  readPath,
} from './preparation'
import {
  reconcileAttempt,
  replaceAttempt,
  type DevelopmentReleaseSignal,
} from './attempts'
import { executeConsequentialAttempt } from './attempt-execution'

type InMemoryTracerOptions<Input, Result extends ActionResult> = Readonly<{
  action: Action<Input, Result>
  now: () => string
  nextInvocationRef: () => string
  nextAuthorityRef?: () => string
  nextAttemptRef?: () => string
  developmentReleaseSignal?: DevelopmentReleaseSignal
  contextForExecution?: (context: ActionContext) => ActionContext
}>

type StoredInvocation<Input, Result extends ActionResult> = {
  view: ActionInvocationView<Result>
  input: Input
  context: ActionContext
  authorityBinding?: {
    reference: string
    invocationRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    invocationVersion: number
    actionId: string
    contractVersion: string
    digest: string
    target: PreparedInvocation['target']
    consequence: string
    limits: PreparedInvocation['dataUse']['limits']
    expiresAt: string
  }
}

/**
 * Development-only in-memory control seam. It proves preparation, exact
 * authority, attributable attempt transitions and registered-runner reuse. It
 * makes no durability, delivery or real external-effect claim.
 */
export function createInMemoryActionInvocationTracer<
  Input,
  Result extends ActionResult,
>(options: InMemoryTracerOptions<Input, Result>): ActionInvocationTracer<Input, Result> {
  const records = new Map<string, StoredInvocation<Input, Result>>()
  const contract = resolveActionContract(options.action)
  let authoritySequence = 0
  let attemptSequence = 0

  const executeRunner = async (
    record: StoredInvocation<Input, Result>,
  ): Promise<ActionInvocationView<Result>> => {
    if (record.view.prepared === undefined) {
      const running = nextView(record.view, { control: { state: 'in_progress' } })
      record.view = running
      try {
        const context = options.contextForExecution?.(record.context) ?? record.context
        const result = await options.action.run({ data: record.input, context })
        record.view = nextView(running, {
          observedResolution: {
            state: 'returned',
            execution: 'runner_returned',
            businessOutcome: classifyBusinessOutcome(result),
            result,
          },
          freshness: { state: 'current', observedAt: options.now() },
          control: { state: 'terminal' },
        })
      } catch (error) {
        record.view = nextView(running, {
          observedResolution: {
            state: 'threw',
            execution: 'runner_threw',
            message: error instanceof Error ? error.message : 'Unknown runner failure',
          },
          freshness: { state: 'current', observedAt: options.now() },
          control: { state: 'terminal' },
        })
      }
      return record.view
    }
    const operationKey = readPath(record.input, 'operationKey')
    if (typeof operationKey !== 'string') {
      throw new Error('Consequential inquiry attempt requires operationKey and prepared material digest.')
    }
    const running = nextView(record.view, { control: { state: 'in_progress' } })
    record.view = running
    const transition = await executeConsequentialAttempt({
      action: options.action,
      actionInput: record.input,
      context: options.contextForExecution?.(record.context) ?? record.context,
      currentView: running,
      attemptRef: options.nextAttemptRef?.() ?? `dev:attempt:${++attemptSequence}`,
      operationKey,
      now: options.now,
      ...(options.developmentReleaseSignal === undefined
        ? {}
        : { releaseSignal: options.developmentReleaseSignal }),
    })
    record.view = nextView(running, transition)
    return record.view
  }

  return {
    async invoke({ origin, input, context }) {
      if (contract.authorityRequirement !== 'none') {
        throw new Error(`Action ${options.action.id} requires prepare/decide/execute authority flow.`)
      }
      const actor = actorFromOrigin(origin)
      const record = createRecord(options, contract.version, origin, actor, input, context)
      records.set(record.view.invocationRef, record)
      return executeRunner(record)
    },
    prepare({ origin, actor, input, context, freshnessMs }) {
      if (contract.authorityRequirement === 'none') {
        throw new Error(`Action ${options.action.id} does not require authority.`)
      }
      const record = createRecord(options, contract.version, origin, actor, input, context)
      const preparedAt = options.now()
      const freshUntil = new Date(Date.parse(preparedAt) + freshnessMs).toISOString()
      const digest = materialDigest(input, contract.materialInputPaths)
      const authorityRef = options.nextAuthorityRef?.() ?? `dev:authority:${++authoritySequence}`
      const prepared: PreparedInvocation = {
        materialInputDigest: digest,
        target: readPath(input, 'target') ?? null,
        consequence: contract.consequenceClass,
        dataUse: dataUseFor(options.action.id, input),
        preparedAt,
        freshUntil,
      }
      record.view = {
        ...record.view,
        prepared,
        authority: { reference: authorityRef, expiresAt: freshUntil },
        control: { state: 'awaiting_authority' },
      }
      record.authorityBinding = {
        reference: authorityRef,
        invocationRef: record.view.invocationRef,
        actor,
        origin,
        invocationVersion: record.view.invocationVersion,
        actionId: options.action.id,
        contractVersion: contract.version,
        digest,
        target: prepared.target,
        consequence: prepared.consequence,
        limits: prepared.dataUse.limits,
        expiresAt: freshUntil,
      }
      records.set(record.view.invocationRef, record)
      return record.view
    },
    decide(input) {
      const checked = checkBinding(records.get(input.invocationRef), input, options.now())
      if (checked.kind === 'refused') return checked
      const record = checked.record
      if (record.view.control.state !== 'awaiting_authority') {
        return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      }
      if (!input.accept) {
        record.view = nextView(record.view, {
          control: { state: 'invalidated', reason: 'authority_not_accepted' },
        })
        return { kind: 'refused', code: 'authority_not_accepted', view: record.view }
      }
      record.view = nextView(record.view, {
        control: { state: 'authorized', decidedAt: options.now() },
      })
      if (record.authorityBinding) record.authorityBinding.invocationVersion = record.view.invocationVersion
      return { kind: 'accepted', view: record.view }
    },
    async execute(input) {
      const checked = checkBinding(records.get(input.invocationRef), input, options.now())
      if (checked.kind === 'refused') return checked
      const record = checked.record
      if (record.view.control.state === 'reconciliation_required') {
        return { kind: 'refused', code: 'reconciliation_required', view: record.view }
      }
      if (record.view.control.state !== 'authorized' && record.view.control.state !== 'retryable') {
        return { kind: 'refused', code: 'authority_not_accepted', view: record.view }
      }
      const digest = materialDigest(input.materialInput, contract.materialInputPaths)
      if (digest !== record.authorityBinding?.digest) {
        record.view = nextView(record.view, {
          control: { state: 'invalidated', reason: 'material_input_changed' },
        })
        return { kind: 'refused', code: 'material_input_changed', view: record.view }
      }
      record.input = input.materialInput
      return { kind: 'accepted', view: await executeRunner(record) }
    },
    reconcile(input) {
      const record = records.get(input.invocationRef)
      if (record === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      if (record.view.invocationVersion !== input.expectedInvocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version', view: record.view }
      }
      if (
        record.view.owner.callerRef !== input.actor.callerRef ||
        record.view.owner.principalRef !== input.actor.principalRef
      ) return { kind: 'refused', code: 'cross_principal_refused', view: record.view }
      if (JSON.stringify(record.view.origin) !== JSON.stringify(input.origin)) {
        return { kind: 'refused', code: 'cross_origin_refused', view: record.view }
      }
      if (
        record.view.control.state !== 'reconciliation_required' ||
        record.view.control.attemptRef !== input.attemptRef
      ) return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      const attempt = record.view.attempts.find((candidate) => candidate.attemptRef === input.attemptRef)
      if (attempt === undefined) return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      const reconciled = reconcileAttempt(attempt, input.resolution, options.now())
      record.view = nextView(record.view, {
        attempts: replaceAttempt(record.view.attempts, reconciled),
        control: input.resolution === 'not_released'
          ? { state: 'retryable', reason: 'pre_release_failure' }
          : { state: 'terminal' },
      })
      return { kind: 'accepted', view: record.view }
    },
    inspect(invocationRef) {
      return records.get(invocationRef)?.view
    },
  }
}

function createRecord<Input, Result extends ActionResult>(
  options: InMemoryTracerOptions<Input, Result>,
  contractVersion: string,
  origin: ActionInvocationOrigin,
  actor: InvocationActor,
  input: Input,
  context: ActionContext,
): StoredInvocation<Input, Result> {
  return {
    input,
    context,
    view: {
      invocationRef: options.nextInvocationRef(),
      invocationVersion: 1,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'in_memory_only',
      origin,
      owner: actor,
      action: { id: options.action.id, contractVersion },
      desired: { state: 'invoke' },
      attempts: [],
      observedResolution: { state: 'pending' },
      freshness: { state: 'not_observed' },
      control: { state: 'in_progress' },
    },
  }
}

function nextView<Result extends ActionResult>(
  view: ActionInvocationView<Result>,
  change: Partial<ActionInvocationView<Result>>,
): ActionInvocationView<Result> {
  return { ...view, ...change, invocationVersion: view.invocationVersion + 1 }
}

function checkBinding<Input, Result extends ActionResult>(
  record: StoredInvocation<Input, Result> | undefined,
  input: {
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
  },
  now: string,
): { kind: 'ok'; record: StoredInvocation<Input, Result> } | Readonly<{
  kind: 'refused'
  code: DecisionRefusalCode
  view?: ActionInvocationView<Result>
}> {
  if (!record?.authorityBinding) return { kind: 'refused', code: 'invocation_not_found' }
  if (record.view.invocationVersion !== input.expectedInvocationVersion) {
    return { kind: 'refused', code: 'stale_invocation_version', view: record.view }
  }
  const binding = record.authorityBinding
  if (
    binding.reference !== input.authorityRef ||
    binding.actor.callerRef !== input.actor.callerRef ||
    binding.actor.principalRef !== input.actor.principalRef
  ) return { kind: 'refused', code: 'cross_principal_refused', view: record.view }
  if (JSON.stringify(binding.origin) !== JSON.stringify(input.origin)) {
    return { kind: 'refused', code: 'cross_origin_refused', view: record.view }
  }
  if (Date.parse(now) >= Date.parse(binding.expiresAt)) {
    record.view = nextView(record.view, {
      control: { state: 'invalidated', reason: 'authority_expired' },
    })
    return { kind: 'refused', code: 'authority_expired', view: record.view }
  }
  return { kind: 'ok', record }
}
