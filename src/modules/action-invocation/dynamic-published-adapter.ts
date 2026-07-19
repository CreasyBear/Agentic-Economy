import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { createDevelopmentReleaseSignal } from './attempts'
import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  InvocationActor,
  InvocationDecision,
  StandingMandateAuthorityBasis,
} from './contracts'
import {
  buildDynamicPublishedInput,
  createDynamicPublishedAction,
  dynamicPublishedSourceDigest,
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import {
  executeDynamicPublishedTransport,
  type DynamicPublishedExecutionToken,
} from './dynamic-published-execution'
import {
  requalifyDynamicPublishedSource,
  dynamicPublishedOperationSlot,
  type DynamicPublishedSourcePort,
} from './dynamic-published-source'
import { createDurableActionInvocationTracer } from './durable'
import { readCompletedResultIdentity, type CompletedResultIdentity } from './durable'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  type DevelopmentDurableState,
} from './internal/development-durable-port'
import type {
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlResult,
} from './internal/durable-contracts'
import type { DynamicPublishedSourceRow } from './dynamic-published-source'
import { assertDynamicPublishedSnapshotShape } from './dynamic-published-snapshot-verifier'

export type DynamicPublishedAdapterSnapshot = Readonly<{
  format: 'dynamic-published-action-invocation:development:v1'
  sourceRows: readonly DynamicPublishedSourceRow[]
  controls: readonly DurableControlRow<DynamicPublishedInvocationResult>[]
  attempts: readonly Readonly<{ invocationRef: string; rows: readonly DurableAttemptRow[] }>[]
  history: readonly Readonly<{ invocationRef: string; rows: readonly DurableHistoryRow[] }>[]
  commands: readonly Readonly<{
    commandId: string
    value: Readonly<{ digest: string; result: PersistControlResult }>
  }>[]
}>

export type DynamicPublishedActionInvocationAdapter = Readonly<{
  descriptor: RuntimePublishedOperationDescriptor
  prepare(input: Readonly<{
    origin: ActionInvocationOrigin
    actor: InvocationActor
    value: StableHashValue
    freshnessMs: number
  }>): ActionInvocationView<DynamicPublishedInvocationResult>
  decide(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    accept: boolean
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  authorizeStandingMandateUse(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    basis: StandingMandateAuthorityBasis
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  acquire(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    leaseOwner: string
    leaseMs: number
    acceptedAuthorityBasis?: StandingMandateAuthorityBasis
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  executeAcquired(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  cancel(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    actor: InvocationActor
    origin: ActionInvocationOrigin
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  reconcile: ReturnType<typeof createDurableActionInvocationTracer<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  >>['reconcile']
  inspect(invocationRef: string): ActionInvocationView<DynamicPublishedInvocationResult> | undefined
  readCompletedResult(
    invocationRef: string,
    actor: InvocationActor,
  ): CompletedResultIdentity
  exportSnapshot(): DynamicPublishedAdapterSnapshot
}>

export function createDynamicPublishedActionInvocationAdapter(input: Readonly<{
  operation: PublishedOperation
  source: DynamicPublishedSourcePort
  runtime: RouteTransportRuntime
  now: () => number
  nextInvocationRef: () => string
  nextAuthorityRef: () => string
  nextAttemptRef: () => string
  durableState?: DevelopmentDurableState<DynamicPublishedInvocationResult>
}>): DynamicPublishedActionInvocationAdapter {
  const descriptor = materializeRuntimePublishedOperation(input.operation)
  const releaseSignal = createDevelopmentReleaseSignal()
  const durableState = input.durableState ?? createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  const durablePort = createDevelopmentDurablePort(durableState)
  const executionTokens = new Map<string, DynamicPublishedExecutionToken>()
  const action = createDynamicPublishedAction({
    operation: input.operation,
    descriptor,
    now: input.now,
    preReleaseCheck: async (value) => {
      const reason = requalifyDynamicPublishedSource({
        preparedOperation: input.operation,
        descriptor,
        currentOperation: input.source.current(dynamicPublishedOperationSlot(input.operation)),
        value: value.input,
        now: input.now(),
      })
      return reason === undefined ? undefined : {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        release: 'not_released',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: reason,
      }
    },
    run: async (value) => {
      const token = executionTokens.get(value.operationKey)
      if (token === undefined) throw new Error('published_operation_attempt_not_leased')
      const result = await executeDynamicPublishedTransport({
        operation: input.operation,
        descriptor,
        invocation: value,
        token,
        runtime: input.runtime,
        markReleased: releaseSignal.markReleased,
      })
      const row = input.source.read(value.operationKey)
      if (row !== undefined) {
        input.source.write({
          ...row,
          observedResolution: {
            state: 'returned',
            execution: result.release === 'not_released'
              ? 'pre_release_refused'
              : 'runner_returned',
            businessOutcome: result.kind,
            resultReferenceable:
              result.release === 'released' && result.kind === 'published_operation_succeeded',
            result,
          },
          resultIdentity: {
            sourceResultRef: `published-result:${value.operationKey}`,
            resultDigest: canonicalDigest(result as unknown as StableHashValue),
          },
        })
      }
      return result
    },
  })
  const resumeInvocationRef = input.durableState === undefined
    ? undefined
    : durableState.controls.keys().next().value as string | undefined
  const tracer = createDurableActionInvocationTracer({
    action,
    port: durablePort,
    now: () => new Date(input.now()).toISOString(),
    nextInvocationRef: input.nextInvocationRef,
    nextAuthorityRef: input.nextAuthorityRef,
    nextAttemptRef: input.nextAttemptRef,
    developmentReleaseSignal: releaseSignal,
    verifyReconciliationEvidence: (evidence) =>
      evidence.source === `published-operation:${input.operation.operationId}`,
    resolveSourceState: (operationKey) => {
      const row = input.source.read(operationKey)
      if (row === undefined) throw new Error(`Missing dynamic published source ${operationKey}.`)
      return {
        input: row.input,
        context: row.context,
        prepared: row.prepared,
        observedResolution: row.observedResolution,
        ...(row.resultIdentity === undefined ? {} : { resultIdentity: row.resultIdentity }),
      }
    },
  }, resumeInvocationRef)

  const materialFor = (invocationRef: string): DynamicPublishedInvocationInput | undefined => {
    const control = durableState.controls.get(invocationRef)
    return control === undefined ? undefined : input.source.read(control.sourceRef)?.input
  }

  return {
    descriptor,
    prepare(request) {
      const material = buildDynamicPublishedInput({
        operation: input.operation,
        descriptor,
        value: request.value,
      })
      const current = input.source.current(dynamicPublishedOperationSlot(input.operation))
      const reason = requalifyDynamicPublishedSource({
        preparedOperation: input.operation,
        descriptor,
        currentOperation: current,
        value: request.value,
        now: input.now(),
      })
      if (reason !== undefined) throw new Error(`published_operation_not_current:${reason}`)
      input.source.write({
        operationKey: material.operationKey,
        operation: input.operation,
        input: material,
        context: {},
        observedResolution: { state: 'pending' },
      })
      const view = tracer.prepare({
        origin: request.origin,
        actor: request.actor,
        input: material,
        context: {},
        freshnessMs: Math.min(
          request.freshnessMs,
          Math.max(1, input.operation.readiness.validUntil - input.now()),
        ),
      })
      input.source.write({
        operationKey: material.operationKey,
        operation: input.operation,
        input: material,
        context: {},
        ...(view.prepared === undefined ? {} : { prepared: view.prepared }),
        observedResolution: { state: 'pending' },
      })
      return view
    },
    decide: tracer.decide,
    authorizeStandingMandateUse: tracer.authorizeStandingMandateUse,
    acquire(request) {
      const materialInput = materialFor(request.invocationRef)
      if (materialInput === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      return tracer.acquire({ ...request, materialInput })
    },
    async executeAcquired(request) {
      const material = materialFor(request.invocationRef)
      const view = tracer.inspect(request.invocationRef)
      if (material === undefined || view?.authority === undefined) {
        return { kind: 'refused', code: 'invocation_not_found' }
      }
      executionTokens.set(material.operationKey, {
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
        authorityRef: view.authority.reference,
        mandateDigest: canonicalDigest(view.acceptedAuthority as unknown as StableHashValue),
        grantDigest: canonicalDigest({
          acceptedAuthority: view.acceptedAuthority,
          owner: view.owner,
          origin: view.origin,
        } as unknown as StableHashValue),
        expiresAt: Date.parse(view.authority.expiresAt),
      })
      try {
        return await tracer.executeAcquired(request)
      } finally {
        executionTokens.delete(material.operationKey)
      }
    },
    cancel(request) {
      const operation = input.source.current(dynamicPublishedOperationSlot(input.operation))
      if (operation?.binding.cancellation.kind === 'unsupported') {
        const view = tracer.inspect(request.invocationRef)
        return {
          kind: 'refused',
          code: 'invalid_control_state',
          ...(view === undefined ? {} : { view }),
        }
      }
      return tracer.cancel(request)
    },
    reconcile: tracer.reconcile,
    inspect: tracer.inspect,
    readCompletedResult(invocationRef, actor) {
      return readCompletedResultIdentity(
        durablePort,
        invocationRef,
        actor,
        (operationKey) => {
          const row = input.source.read(operationKey)
          const returned = row?.observedResolution.state === 'returned'
            ? row.observedResolution.result
            : undefined
          return {
            ...(row?.resultIdentity?.sourceResultRef === undefined
              ? {}
              : { sourceResultRef: row.resultIdentity.sourceResultRef }),
            ...(returned === undefined ? {} : { result: returned }),
          }
        },
      )
    },
    exportSnapshot() {
      const snapshot: DynamicPublishedAdapterSnapshot = {
        format: 'dynamic-published-action-invocation:development:v1',
        sourceRows: input.source.list(),
        controls: [...durableState.controls.values()],
        attempts: [...durableState.attempts].map(([invocationRef, rows]) => ({
          invocationRef,
          rows: [...rows.values()],
        })),
        history: [...durableState.history].map(([invocationRef, rows]) => ({ invocationRef, rows })),
        commands: [...durableState.commands].map(([commandId, value]) => ({ commandId, value })),
      }
      return JSON.parse(JSON.stringify(snapshot)) as DynamicPublishedAdapterSnapshot
    },
  }
}

export function loadDynamicPublishedAdapterSnapshot(
  snapshot: unknown,
): Readonly<{
  durableState: DevelopmentDurableState<DynamicPublishedInvocationResult>
  sourceRows: Map<string, DynamicPublishedSourceRow>
}> {
  assertDynamicPublishedSnapshotShape(snapshot)
  const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  for (const row of snapshot.controls) durableState.controls.set(row.invocationRef, row)
  for (const group of snapshot.attempts) {
    durableState.attempts.set(group.invocationRef, new Map(group.rows.map((row) => [row.attemptRef, row])))
  }
  for (const group of snapshot.history) durableState.history.set(group.invocationRef, [...group.rows])
  for (const command of snapshot.commands) durableState.commands.set(command.commandId, command.value)
  return {
    durableState,
    sourceRows: new Map(snapshot.sourceRows.map((row) => [row.operationKey, row])),
  }
}
