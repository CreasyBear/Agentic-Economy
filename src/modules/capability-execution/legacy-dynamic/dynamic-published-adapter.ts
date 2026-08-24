import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ActionContext } from '@/modules/common/action'

import type { MoneyInvocationPort } from '@/modules/money/public'
import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  DecisionRefusalCode,
  InMemoryControlSnapshot,
  InvocationActor,
  InvocationDecision,
  StandingMandateAuthorityBasis,
} from '@/modules/action-invocation/runtime'
import type { ReconciliationEvidence } from '@/modules/action-invocation/runtime'
import type { DevelopmentTimeoutSignal } from '@/modules/action-invocation/runtime'
import {
  buildDynamicPublishedInput,
  dynamicPublishedSourceDigest,
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type { DynamicPublishedExecutionToken } from './dynamic-published-execution'
import {
  requalifyDynamicPublishedSource,
  dynamicPublishedOperationSlot,
  type DynamicPublishedSourcePort,
  type DynamicPublishedSourceRow,
} from './dynamic-published-source'
import { createDurableActionInvocationTracer, type CompletedResultIdentity } from '@/modules/action-invocation/runtime'
import { materialDigest, type DevelopmentDurableState } from '@/modules/action-invocation/runtime'
import type { DurableActionInvocationPort } from '@/modules/action-invocation/runtime'
import {
  inspectUserInputContract,
  type InvocationInputHistory,
  type InvocationInputWork,
} from './input-work'
import { createDynamicPublishedInputApplication } from './input-application'
import type {
  X402PaymentAttempt,
  X402PaymentAttemptPort,
} from '@/modules/action-invocation/runtime'
import type {
  X402PaymentReconciliationEvidence,
  X402PaymentReconciliationEvidenceError,
  X402PaymentReconciliationEvidenceVerifier,
} from '@/modules/action-invocation/runtime'
import { createDynamicPublishedAdapterCommands } from './dynamic-published-adapter-commands'
import {
  loadDynamicPublishedAdapterSnapshot,
  type DynamicPublishedAdapterSnapshot,
} from './dynamic-published-adapter-snapshot'
import {
  createDynamicPublishedAdapterTransact,
  type DynamicPublishedAdapterRuntime,
} from './dynamic-published-adapter-transact'

export type { DynamicPublishedAdapterSnapshot }
export { loadDynamicPublishedAdapterSnapshot }

export type DynamicPublishedActionInvocationAdapter = Readonly<{
  descriptor: RuntimePublishedOperationDescriptor
  begin(input: Readonly<{
    origin: ActionInvocationOrigin
    actor: InvocationActor
    partial: Readonly<Record<string, StableHashValue>>
  }>): Promise<InvocationInputWork>
  answer(input: Readonly<{
    invocationRef: string
    actor: InvocationActor
    answers: Readonly<Record<string, StableHashValue>>
    freshnessMs: number
  }>): Promise<InvocationInputWork | ActionInvocationView<DynamicPublishedInvocationResult>>
  correct(input: Readonly<{
    invocationRef: string
    actor: InvocationActor
    corrections: Readonly<Record<string, StableHashValue>>
    freshnessMs: number
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  readInputWork(invocationRef: string): InvocationInputWork | undefined
  prepare(input: Readonly<{
    origin: ActionInvocationOrigin
    actor: InvocationActor
    value: StableHashValue
    freshnessMs: number
  }>): Promise<ActionInvocationView<DynamicPublishedInvocationResult>>
  decide(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    accept: boolean
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  authorizeStandingMandateUse(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    basis: StandingMandateAuthorityBasis
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  acquire(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    leaseOwner: string
    leaseMs: number
    acceptedAuthorityBasis?: StandingMandateAuthorityBasis
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  executeAcquired(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  abandonAcquired(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  cancel(input: Readonly<{
    invocationRef: string
    idempotencyKey: string
    expectedInvocationVersion: number
    actor: InvocationActor
    origin: ActionInvocationOrigin
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  reconcile: ReturnType<typeof createDurableActionInvocationTracer<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  >>['reconcile']
  validateReconciliation(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    evidence: ReconciliationEvidence
  }>): DecisionRefusalCode | undefined
  reconcilePayment(input: Readonly<{
    evidence: X402PaymentReconciliationEvidence
    persist?: boolean
  }>): Promise<
    | Readonly<{ kind: 'accepted'; attempt: X402PaymentAttempt }>
    | Readonly<{ kind: 'refused'; code: X402PaymentReconciliationEvidenceError | 'payment_attempt_not_found' | 'payment_attempt_reconciliation_not_required' | 'command_identity_conflict' }>
  >
  inspect(invocationRef: string): ActionInvocationView<DynamicPublishedInvocationResult> | undefined
  readCompletedResult(
    invocationRef: string,
    actor: InvocationActor,
  ): Promise<CompletedResultIdentity>
  exportDevelopmentSnapshot(): DynamicPublishedAdapterSnapshot
}>

export function createDynamicPublishedActionInvocationAdapter(input: Readonly<{
  operation: PublishedOperation
  source: DynamicPublishedSourcePort
  runtime: RouteTransportRuntime
  now: () => number
  nextInvocationRef: () => string
  nextAuthorityRef: () => string
  nextAttemptRef: () => string
  issueProviderLease?: (input: Readonly<{
    invocationRef: string
    attemptRef: string
    effectGeneration: number
    authorityRef: string
    expiresAt: number
  }>) => Promise<DynamicPublishedExecutionToken['providerLease']>
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  initialSnapshot?: InMemoryControlSnapshot<DynamicPublishedInvocationResult>
  developmentSnapshot?: DevelopmentDurableState<DynamicPublishedInvocationResult>
  developmentTimeoutSignal?: DevelopmentTimeoutSignal
  inputWork?: readonly InvocationInputWork[]
  inputHistory?: readonly InvocationInputHistory[]
  paymentAttemptPort: X402PaymentAttemptPort
  moneyPort?: MoneyInvocationPort
  verifyPaymentReconciliationEvidence?: X402PaymentReconciliationEvidenceVerifier
}>): DynamicPublishedActionInvocationAdapter {
  const descriptor = materializeRuntimePublishedOperation(input.operation)
  const durablePort = input.durablePort
  const adapterRuntime: DynamicPublishedAdapterRuntime = {
    executionTokens: new Map(),
    preparedTransports: new Map(),
    moneyCharges: new Map(),
    semanticClaims: new Map(),
  }
  const { semanticClaims } = adapterRuntime
  const inputWork = new Map((input.inputWork ?? []).map((row) => [row.invocationRef, row]))
  const inputHistory = [...(input.inputHistory ?? [])]
  let pendingSource: Readonly<{
    row: Omit<DynamicPublishedSourceRow, 'invocationRef'>
    context: ActionContext
  }> | undefined
  const action = createDynamicPublishedAdapterTransact({
    operation: input.operation,
    descriptor,
    source: input.source,
    runtime: input.runtime,
    now: input.now,
    paymentAttemptPort: input.paymentAttemptPort,
    durablePort,
    adapterRuntime,
    ...(input.moneyPort === undefined ? {} : { moneyPort: input.moneyPort }),
  })
  const tracer = createDurableActionInvocationTracer({
    action,
    port: durablePort,
    now: () => new Date(input.now()).toISOString(),
    nextInvocationRef: () => {
      const invocationRef = input.nextInvocationRef()
      const pending = pendingSource
      if (pending === undefined) throw new Error('dynamic_published_source_not_reserved')
      input.source.write({ ...pending.row, invocationRef })
      return invocationRef
    },
    nextAuthorityRef: input.nextAuthorityRef,
    nextAttemptRef: input.nextAttemptRef,
    onExecutionResolved: (view) => {
      const row = input.source.read(view.invocationRef)
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
      const referenceable = view.observedResolution.resultReferenceable
      const reusedIdentity = referenceable && claim?.kind === 'reuse' ? claim.outcome?.resultIdentity : undefined
      const resultIdentity = reusedIdentity ?? {
        sourceResultRef: `published-result:${referenceable ? claim?.semanticIdentityDigest ?? view.invocationRef : view.invocationRef}`,
        resultDigest: canonicalDigest(
          view.observedResolution.result,
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
    ...(input.developmentTimeoutSignal === undefined
      ? {}
      : { developmentTimeoutSignal: input.developmentTimeoutSignal }),
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
  }, input.initialSnapshot)

  const materialFor = async (
    invocationRef: string,
  ): Promise<DynamicPublishedInvocationInput | undefined> => {
    const control = await durablePort.readControl(invocationRef)
    if (control === undefined) return undefined
    return input.source.read(control.sourceRef)?.input
  }

  const prepareValue = async (request: Readonly<{
    origin: ActionInvocationOrigin
    actor: InvocationActor
    value: StableHashValue
    freshnessMs: number
    continuation?: Readonly<{ invocationRef: string; expectedInvocationVersion: number; revise: boolean }>
  }>): Promise<ActionInvocationView<DynamicPublishedInvocationResult>> => {
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
        origin: request.origin,
        owner: request.actor,
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
    const priorSource = request.continuation === undefined
      ? undefined
      : input.source.read(request.continuation.invocationRef)
    if (request.continuation !== undefined) {
      input.source.write({
        ...pendingSource.row,
        invocationRef: request.continuation.invocationRef,
      })
    }
    const preparation = {
      origin: request.origin,
      actor: request.actor,
      input: material,
      context,
      freshnessMs: Math.min(
        request.freshnessMs,
        Math.max(1, input.operation.readiness.validUntil - input.now()),
      ),
    }
    let decision: InvocationDecision<DynamicPublishedInvocationResult>
    try {
      decision = request.continuation === undefined
        ? { kind: 'accepted' as const, view: await tracer.prepare(preparation) }
        : request.continuation.revise
          ? await tracer.revisePrepared({ ...preparation, ...request.continuation })
          : {
              kind: 'accepted' as const,
              view: await tracer.prepareExisting({ ...preparation, ...request.continuation }),
            }
      if (decision.kind === 'refused') {
        throw new Error(`published_operation_prepare_refused:${decision.code}`)
      }
    } catch (error) {
      if (request.continuation !== undefined) {
        if (priorSource === undefined) input.source.remove(request.continuation.invocationRef)
        else input.source.write(priorSource)
      }
      throw error
    } finally {
      pendingSource = undefined
    }
    const view = decision.view
    input.source.write({
      invocationRef: view.invocationRef,
      origin: view.origin,
      owner: view.owner,
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
    const contract = inspectUserInputContract(input.operation)
    inputWork.set(view.invocationRef, {
      invocationRef: view.invocationRef,
      invocationVersion: view.invocationVersion,
      origin: view.origin,
      owner: view.owner,
      state: 'prepared',
      operationId: input.operation.operationId,
      operationVersion: descriptor.version,
      sourceMaterialDigest: dynamicPublishedSourceDigest(input.operation, descriptor),
      knownInput: request.value as Readonly<Record<string, StableHashValue>>,
      requiredFields: contract.requiredFields,
      missingFields: [],
      askedFields: inputWork.get(view.invocationRef)?.askedFields ?? [],
      updatedAt: new Date(input.now()).toISOString(),
    })
    return view
  }

  const inputApplication = createDynamicPublishedInputApplication({
    operation: input.operation,
    descriptor,
    source: input.source,
    durablePort,
    work: inputWork,
    history: inputHistory,
    now: input.now,
    nextInvocationRef: input.nextInvocationRef,
    prepareValue,
    inspect: tracer.inspect,
  })

  const commands = createDynamicPublishedAdapterCommands({
    operation: input.operation,
    source: input.source,
    now: input.now,
    paymentAttemptPort: input.paymentAttemptPort,
    durablePort,
    tracer,
    materialFor,
    adapterRuntime,
    inputWork,
    inputHistory,
    ...(input.issueProviderLease === undefined ? {} : { issueProviderLease: input.issueProviderLease }),
    ...(input.developmentSnapshot === undefined ? {} : { developmentSnapshot: input.developmentSnapshot }),
    ...(input.verifyPaymentReconciliationEvidence === undefined
      ? {}
      : { verifyPaymentReconciliationEvidence: input.verifyPaymentReconciliationEvidence }),
  })

  return {
    descriptor,
    ...inputApplication,
    prepare: prepareValue,
    decide: tracer.decide,
    authorizeStandingMandateUse: tracer.authorizeStandingMandateUse,
    ...commands,
    reconcile: tracer.reconcile,
    inspect: tracer.inspect,
  }
}
