import {
  resolveActionContract,
  type ActionResult,
} from '@/modules/common/action'
import type {
  ActionInvocationTracer,
  ActionInvocationView,
  InvocationDecision,
  PreparedInvocation,
} from './contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  actorFromOrigin,
  classifyBusinessOutcome,
  dataUseFor,
  materialDigest,
  readPath,
} from './preparation'
import {
  createAttempt,
  replaceAttempt,
} from './attempts'
import {
  beginAcquiredRelease,
  checkReleaseCompletionFence,
  executeReleasedAttempt,
} from './fenced-execution'
import {
  acquireLease,
  leaseIsExpired,
  nextEffectGeneration,
} from './lease-control'
import {
  checkBinding,
  createRecord,
  createRecordStore,
  exportControlSnapshot,
  nextView,
  type InMemoryTracerOptions,
  type StoredInvocation,
} from './in-memory-record-store'
import {
  cancelInvocation,
  publishObservation,
  reconcileInvocation,
} from './resolution-control'

/**
 * Development-only in-memory control seam. It proves preparation, exact
 * authority, attributable attempt transitions and registered-runner reuse. It
 * makes no durability, delivery or real external-effect claim.
 */
export function createInMemoryActionInvocationTracer<
  Input,
  Result extends ActionResult,
>(options: InMemoryTracerOptions<Input, Result>): ActionInvocationTracer<Input, Result> {
  const records = createRecordStore(options)
  const contract = resolveActionContract(options.action)
  let authoritySequence = 0
  let attemptSequence = 0

  const runAcquired = async (
    record: StoredInvocation<Input, Result>,
    input: Readonly<{
      expectedInvocationVersion: number
      attemptRef: string
      leaseOwner: string
      effectGeneration: number
    }>,
  ): Promise<InvocationDecision<Result>> => {
    const operationKey = readPath(record.input, 'operationKey')
    if (typeof operationKey !== 'string') {
      throw new Error('Consequential inquiry attempt requires operationKey and prepared material digest.')
    }
    const preReleaseResult = options.action.preReleaseCheck === undefined
      ? undefined
      : await options.action.preReleaseCheck({
          data: record.input,
          context: options.contextForExecution?.(record.context) ?? record.context,
        })
    if (preReleaseResult !== undefined) {
      const attempt = record.view.attempts.find(({ attemptRef }) => attemptRef === input.attemptRef)
      if (attempt === undefined) {
        return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      }
      record.view = nextView(record.view, {
        attempts: replaceAttempt(record.view.attempts, {
          ...attempt,
          release: { state: 'not_released' },
          outcome: {
            state: 'returned',
            businessOutcome: classifyBusinessOutcome(preReleaseResult),
          },
        }),
        observedResolution: {
          state: 'returned',
          execution: 'runner_returned',
          businessOutcome: classifyBusinessOutcome(preReleaseResult),
          result: preReleaseResult,
        },
        freshness: { state: 'current', observedAt: options.now() },
        control: { state: 'terminal' },
      })
      return { kind: 'accepted', view: record.view }
    }
    const releaseStart = beginAcquiredRelease({
      view: record.view,
      ...input,
      now: options.now,
    })
    if (releaseStart.kind !== 'accepted') {
      if (releaseStart.view !== undefined) record.view = releaseStart.view
      return releaseStart
    }
    record.view = releaseStart.view
    const completed = await executeReleasedAttempt({
      action: options.action,
      actionInput: record.input,
      context: options.contextForExecution?.(record.context) ?? record.context,
      releaseStartView: releaseStart.view,
      attemptRef: input.attemptRef,
      leaseOwner: input.leaseOwner,
      effectGeneration: input.effectGeneration,
      operationKey,
      now: options.now,
      ...(options.developmentReleaseSignal === undefined
        ? {}
        : { releaseSignal: options.developmentReleaseSignal }),
    })
    const completionRefusal = checkReleaseCompletionFence(record.view, releaseStart.view, input)
    if (completionRefusal !== undefined) {
      return { kind: 'refused', code: completionRefusal, view: record.view }
    }
    record.view = completed
    return { kind: 'accepted', view: record.view }
  }

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
    const leaseOwner = 'development:execute'
    const leaseExpiresAt = new Date(Date.parse(options.now()) + 30_000).toISOString()
    const attempt = createAttempt({
      actionId: options.action.id,
      attemptRef: options.nextAttemptRef?.() ?? `dev:attempt:${++attemptSequence}`,
      attemptNumber: record.view.attempts.length + 1,
      actor: record.view.owner,
      operationKey,
      materialInputDigest: record.view.prepared.materialInputDigest,
      effectGeneration: nextEffectGeneration(record.view.attempts),
      leaseOwner,
      leaseExpiresAt,
    })
    record.view = acquireLease({
      view: record.view,
      actionId: options.action.id,
      attemptRef: attempt.attemptRef,
      operationKey,
      materialInputDigest: record.view.prepared.materialInputDigest,
      leaseOwner,
      leaseExpiresAt,
    })
    const result = await runAcquired(record, {
      expectedInvocationVersion: record.view.invocationVersion,
      attemptRef: attempt.attemptRef,
      leaseOwner,
      effectGeneration: attempt.effectGeneration,
    })
    if (result.kind !== 'accepted') throw new Error(`Development execution refused: ${result.code}`)
    return result.view
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
        dataUse: options.action.projectInvocationPreparation?.(input).dataUse
          ?? dataUseFor(options.action.id, input),
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
        targetDigest: canonicalDigest(prepared.target),
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
      if (record.authorityBinding) {
        record.authorityBinding = {
          ...record.authorityBinding,
          invocationVersion: record.view.invocationVersion,
        }
      }
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
    acquire(input) {
      const checked = checkBinding(records.get(input.invocationRef), input, options.now())
      if (checked.kind === 'refused') return checked
      const record = checked.record
      const control = record.view.control
      if (control.state === 'leased' && leaseIsExpired(control, options.now())) {
        record.view = nextView(record.view, {
          control: { state: 'reconciliation_required', attemptRef: control.attemptRef },
        })
        return { kind: 'refused', code: 'reconciliation_required', view: record.view }
      }
      const canAcquire = control.state === 'authorized' || control.state === 'retryable'
      if (!canAcquire) return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      const digest = materialDigest(input.materialInput, contract.materialInputPaths)
      if (digest !== record.authorityBinding?.digest) {
        return { kind: 'refused', code: 'material_input_changed', view: record.view }
      }
      const operationKey = readPath(input.materialInput, 'operationKey')
      if (typeof operationKey !== 'string' || record.view.prepared === undefined) {
        return { kind: 'refused', code: 'invalid_control_state', view: record.view }
      }
      const leaseExpiresAt = new Date(Date.parse(options.now()) + input.leaseMs).toISOString()
      record.input = input.materialInput
      record.view = acquireLease({
        view: record.view,
        actionId: options.action.id,
        attemptRef: options.nextAttemptRef?.() ?? `dev:attempt:${++attemptSequence}`,
        operationKey,
        materialInputDigest: record.view.prepared.materialInputDigest,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt,
      })
      if (record.authorityBinding) {
        record.authorityBinding = {
          ...record.authorityBinding,
          invocationVersion: record.view.invocationVersion,
        }
      }
      return { kind: 'accepted', view: record.view }
    },
    async executeAcquired(input) {
      const record = records.get(input.invocationRef)
      if (record === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      return runAcquired(record, input)
    },
    publishObservation(input) {
      return publishObservation(records.get(input.invocationRef), input, options.now())
    },
    cancel(input) {
      return cancelInvocation(records.get(input.invocationRef), input)
    },
    reconcile(input) {
      return reconcileInvocation(records.get(input.invocationRef), input, options.now())
    },
    inspect(invocationRef) {
      return records.get(invocationRef)?.view
    },
    exportSnapshot() {
      return exportControlSnapshot(records)
    },
  }
}
