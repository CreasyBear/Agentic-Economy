import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ActionContext } from '@/modules/common/action'

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
  prepareDynamicPublishedTransport,
  type DynamicPublishedExecutionToken,
  type DynamicPublishedPreparedTransport,
} from './dynamic-published-execution'
import {
  requalifyDynamicPublishedSource,
  dynamicPublishedOperationSlot,
  type DynamicPublishedSourcePort,
} from './dynamic-published-source'
import { createDurableActionInvocationTracer } from './durable'
import { readCompletedResultIdentity, type CompletedResultIdentity } from './durable'
import { materialDigest } from './preparation'
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
import {
  verifyDynamicPublishedSnapshot,
  type DynamicPublishedSnapshotAnchors,
} from './dynamic-published-snapshot-verifier'

export type DynamicPublishedAdapterSnapshot = Readonly<{
  format: 'dynamic-published-action-invocation:development:v1'
  sourceRows: readonly DynamicPublishedSourceRow[]
  controls: readonly DurableControlRow<DynamicPublishedInvocationResult>[]
  attempts: readonly Readonly<{ invocationRef: string; rows: readonly DurableAttemptRow[] }>[]
  history: readonly Readonly<{ invocationRef: string; rows: readonly DurableHistoryRow[] }>[]
  commands: readonly Readonly<{
    commandId: string
    value: Readonly<{
      digest: string
      result: PersistControlResult
      material: StableHashValue
    }>
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
  const durableState = input.durableState ?? createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  const durablePort = createDevelopmentDurablePort(durableState)
  const executionTokens = new Map<string, DynamicPublishedExecutionToken>()
  const preparedTransports = new Map<string, DynamicPublishedPreparedTransport>()
  const executionContexts = new Map<string, ActionContext>()
  const semanticClaims = new Map<string, Readonly<{
    kind: 'owner' | 'reuse'
    semanticBaseKey: string
    semanticIdentityDigest: string
    outcome?: import('./dynamic-published-source').DynamicPublishedSharedOutcome
  }>>()
  let pendingSource: Readonly<{
    row: Omit<DynamicPublishedSourceRow, 'invocationRef'>
    context: ActionContext
  }> | undefined
  const runtimeKey = (invocationRef: string, attemptRef: string, generation: number) =>
    `${invocationRef}\u0000${attemptRef}\u0000${generation}`
  const action = createDynamicPublishedAction({
    operation: input.operation,
    descriptor,
    now: input.now,
    preReleaseCheck: async (value, context) => {
      const execution = context.actionInvocationExecution
      if (execution === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_execution_attribution_missing',
      }
      const key = runtimeKey(
        execution.invocationRef,
        execution.attemptRef,
        execution.effectGeneration,
      )
      const reason = requalifyDynamicPublishedSource({
        preparedOperation: input.operation,
        descriptor,
        currentOperation: input.source.current(dynamicPublishedOperationSlot(input.operation)),
        value: value.input,
        now: input.now(),
      })
      if (reason !== undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: reason,
      }
      const token = executionTokens.get(key)
      if (token === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_attempt_not_leased',
      }
      const preparation = prepareDynamicPublishedTransport({
        operation: input.operation,
        descriptor,
        invocation: value,
        token,
        runtime: input.runtime,
      })
      if (preparation.kind === 'refused') return preparation.result
      const row = input.source.read(execution.invocationRef)
      if (row === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_source_missing',
      }
      const claim = input.source.claimSemanticEffect({
        semanticBaseKey: row.semanticBaseKey,
        semanticIdentityDigest: row.semanticIdentityDigest,
        invocationRef: execution.invocationRef,
      })
      if (claim.kind === 'conflict') return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'semantic_idempotency_conflict',
      }
      const outcome = claim.kind === 'wait' ? await claim.outcome
        : claim.kind === 'reuse' ? claim.outcome
          : undefined
      if (outcome !== undefined) {
        semanticClaims.set(execution.invocationRef, {
          kind: 'reuse',
          semanticBaseKey: row.semanticBaseKey,
          semanticIdentityDigest: row.semanticIdentityDigest,
          outcome,
        })
        if (outcome.observedResolution.state === 'returned') {
          return outcome.observedResolution.result
        }
        return undefined
      }
      semanticClaims.set(execution.invocationRef, {
        kind: 'owner',
        semanticBaseKey: row.semanticBaseKey,
        semanticIdentityDigest: row.semanticIdentityDigest,
      })
      preparedTransports.set(key, preparation.prepared)
      return undefined
    },
    run: async (value, context) => {
      const execution = context.actionInvocationExecution
      if (execution === undefined) throw new Error('published_operation_execution_attribution_missing')
      const key = runtimeKey(
        execution.invocationRef,
        execution.attemptRef,
        execution.effectGeneration,
      )
      const token = executionTokens.get(key)
      if (token === undefined) throw new Error('published_operation_attempt_not_leased')
      const claim = semanticClaims.get(execution.invocationRef)
      if (claim?.kind === 'reuse' && claim.outcome !== undefined) {
        if (claim.outcome.observedResolution.state === 'returned') {
          return claim.outcome.observedResolution.result
        }
        throw new Error('published_operation_shared_outcome_uncertain')
      }
      const prepared = preparedTransports.get(key)
      if (prepared === undefined
        || prepared.attemptRef !== token.attemptRef
        || prepared.effectGeneration !== token.effectGeneration) {
        throw new Error('published_operation_transport_not_prepared')
      }
      const result = await executeDynamicPublishedTransport({
        operation: input.operation,
        descriptor,
        prepared,
        runtime: input.runtime,
      })
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
    nextInvocationRef: () => {
      const invocationRef = input.nextInvocationRef()
      const pending = pendingSource
      if (pending === undefined) throw new Error('dynamic_published_source_not_reserved')
      input.source.write({ ...pending.row, invocationRef })
      executionContexts.set(invocationRef, pending.context)
      return invocationRef
    },
    nextAuthorityRef: input.nextAuthorityRef,
    nextAttemptRef: input.nextAttemptRef,
    onExecutionResolved: (view) => {
      const operationKey = durableState.controls.get(view.invocationRef)?.sourceRef
      if (operationKey === undefined) return
      const row = input.source.read(operationKey)
      if (row === undefined) return
      const claim = semanticClaims.get(view.invocationRef)
      if (view.observedResolution.state !== 'returned') {
        input.source.write({ ...row, observedResolution: view.observedResolution })
        if (claim?.kind === 'owner') {
          input.source.completeSemanticEffect({
            semanticBaseKey: claim.semanticBaseKey,
            outcome: {
              semanticIdentityDigest: claim.semanticIdentityDigest,
              ownerInvocationRef: view.invocationRef,
              observedResolution: view.observedResolution,
            },
          })
        }
        return
      }
      const reusedIdentity = claim?.kind === 'reuse' ? claim.outcome?.resultIdentity : undefined
      const resultIdentity = reusedIdentity ?? {
        sourceResultRef: `published-result:${claim?.semanticIdentityDigest ?? view.invocationRef}`,
        resultDigest: canonicalDigest(
          view.observedResolution.result as unknown as StableHashValue,
        ),
      }
      input.source.write({
        ...row,
        observedResolution: view.observedResolution,
        resultIdentity,
      })
      if (claim?.kind === 'owner') {
        input.source.completeSemanticEffect({
          semanticBaseKey: claim.semanticBaseKey,
          outcome: {
            semanticIdentityDigest: claim.semanticIdentityDigest,
            ownerInvocationRef: view.invocationRef,
            observedResolution: view.observedResolution,
            resultIdentity,
          },
        })
      }
    },
    sourceRefForInvocation: (view) => view.invocationRef,
    verifyReconciliationEvidence: (evidence) =>
      evidence.source === `published-operation:${input.operation.operationId}`,
    resolveSourceState: (invocationRef) => {
      const row = input.source.read(invocationRef)
      if (row === undefined) throw new Error(`Missing dynamic published source ${invocationRef}.`)
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
      return control === undefined ? undefined : input.source.read(invocationRef)?.input
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
      const preparedDigest = materialDigest(
        material,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      )
      const semanticBaseKey = canonicalDigest({
        principalRef: request.actor.principalRef,
        actionId: input.operation.operationId,
        actionVersion: descriptor.version,
        operationKey: material.operationKey,
      })
      const context: ActionContext = {}
      pendingSource = {
        context,
        row: {
        operationKey: material.operationKey,
        semanticBaseKey,
        semanticIdentityDigest: canonicalDigest({
          semanticBaseKey,
          target: material.target,
          preparedMaterialDigest: preparedDigest,
        }),
        operation: input.operation,
        input: material,
        context,
        observedResolution: { state: 'pending' },
        },
      }
      const view = tracer.prepare({
        origin: request.origin,
        actor: request.actor,
        input: material,
        context,
        freshnessMs: Math.min(
          request.freshnessMs,
          Math.max(1, input.operation.readiness.validUntil - input.now()),
        ),
      })
      pendingSource = undefined
      input.source.write({
        invocationRef: view.invocationRef,
        operationKey: material.operationKey,
        semanticBaseKey,
        semanticIdentityDigest: canonicalDigest({
          semanticBaseKey,
          target: material.target,
          preparedMaterialDigest: preparedDigest,
        }),
        operation: input.operation,
        input: material,
        context,
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
      if (view.invocationVersion !== request.expectedInvocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version', view }
      }
      if (view.control.state !== 'leased'
        || view.control.attemptRef !== request.attemptRef
        || view.control.effectGeneration !== request.effectGeneration
        || view.control.leaseOwner !== request.leaseOwner) {
        return { kind: 'refused', code: 'lease_not_current', view }
      }
      const context = executionContexts.get(request.invocationRef)
      if (context === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      context.actionInvocationExecution = {
        invocationRef: request.invocationRef,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      }
      const key = runtimeKey(request.invocationRef, request.attemptRef, request.effectGeneration)
      executionTokens.set(key, {
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
        executionTokens.delete(key)
        preparedTransports.delete(key)
        semanticClaims.delete(request.invocationRef)
        delete context.actionInvocationExecution
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
        (invocationRef) => {
          const row = input.source.read(invocationRef)
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
        commands: [...durableState.commands].map(([commandId, value]) => ({
          commandId,
          value: {
            ...value,
            material: durableState.commandMaterials.get(commandId) ?? null,
          },
        })),
      }
      return JSON.parse(JSON.stringify(snapshot)) as DynamicPublishedAdapterSnapshot
    },
  }
}

export function loadDynamicPublishedAdapterSnapshot(
  snapshot: unknown,
  anchors: DynamicPublishedSnapshotAnchors,
): Readonly<{
  durableState: DevelopmentDurableState<DynamicPublishedInvocationResult>
  sourceRows: Map<string, DynamicPublishedSourceRow>
}> {
  verifyDynamicPublishedSnapshot({ snapshot, anchors })
  const verified = snapshot as DynamicPublishedAdapterSnapshot
  const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  for (const row of verified.controls) durableState.controls.set(row.invocationRef, row)
  for (const group of verified.attempts) {
    durableState.attempts.set(group.invocationRef, new Map(group.rows.map((row) => [row.attemptRef, row])))
  }
  for (const group of verified.history) durableState.history.set(group.invocationRef, [...group.rows])
  for (const command of verified.commands) {
    durableState.commands.set(command.commandId, {
      digest: command.value.digest,
      result: command.value.result,
    })
    durableState.commandMaterials.set(command.commandId, command.value.material)
  }
  return {
    durableState,
    sourceRows: new Map(verified.sourceRows.map((row) => [row.invocationRef, row])),
  }
}
