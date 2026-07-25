import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  DecisionRefusalCode,
  InvocationActor,
  InvocationDecision,
} from './contracts'
import type {
  DynamicPublishedActionInvocationAdapter,
} from './dynamic-published-adapter'
import type { DynamicPublishedInvocationResult } from './dynamic-published-contract'
import type { ReconciliationEvidence } from './reconciliation-evidence'
import type { X402PaymentReconciliationEvidence } from './x402-payment-reconciliation-evidence'
import type { InvocationInputWork } from './input-work'
import {
  projectRichInvocationTask,
  projectStructuredInvocationTask,
  type RichInvocationTaskProjection,
  type StructuredInvocationTaskProjection,
} from './host-projection'

export type DevelopmentHostContinuation =
  | Readonly<{ kind: 'completed'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{ kind: 'reconciled'; view: ActionInvocationView<DynamicPublishedInvocationResult> }>
  | Readonly<{
      kind: 'refused'
      code: DevelopmentHostRefusalCode
      view?: ActionInvocationView<DynamicPublishedInvocationResult>
    }>

export type DevelopmentHostRefusalCode =
  | DecisionRefusalCode
  | 'pre_execute_preparation_failed'
  | 'reconcile_before_retry'
  | 'reconciliation_evidence_unavailable'

export type DevelopmentInvocationHost = Readonly<{
  origin: ActionInvocationOrigin
  actor: InvocationActor
  begin(value: Readonly<Record<string, StableHashValue>>): InvocationInputWork
  answer(
    invocationRef: string,
    answers: Readonly<Record<string, StableHashValue>>,
    freshnessMs: number,
  ): InvocationInputWork | ActionInvocationView<DynamicPublishedInvocationResult>
  prepare(value: StableHashValue, freshnessMs: number): ActionInvocationView<DynamicPublishedInvocationResult>
  correct(
    invocationRef: string,
    corrections: Readonly<Record<string, StableHashValue>>,
    freshnessMs: number,
  ): InvocationDecision<DynamicPublishedInvocationResult>
  decide(invocationRef: string, accept: boolean): InvocationDecision<DynamicPublishedInvocationResult>
  continue(invocationRef: string): Promise<DevelopmentHostContinuation>
  recover(
    invocationRef: string,
    reconciliationEvidence?: ReconciliationEvidence,
  ): DevelopmentHostContinuation
  recoverPaidOperation(
    invocationRef: string,
    reconciliationEvidence: ReconciliationEvidence,
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence,
  ): Promise<DevelopmentHostContinuation>
  requestCancellation(invocationRef: string): InvocationDecision<DynamicPublishedInvocationResult>
  inspect(invocationRef: string): ActionInvocationView<DynamicPublishedInvocationResult> | undefined
  projectRich(invocationRef: string, expectedInvocationVersion: number): RichInvocationTaskProjection
  projectStructured(
    invocationRef: string,
    expectedInvocationVersion: number,
  ): StructuredInvocationTaskProjection
  exportSnapshot: DynamicPublishedActionInvocationAdapter['exportSnapshot']
}>

export type DevelopmentHostSourceCommands = Readonly<{
  leaseOwner(host: 'request_owned_human' | 'standalone_external_agent', invocationRef: string): string
  reconciliationEvidence(
    view: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): ReconciliationEvidence | undefined
  beforeExecute?(
    view: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): void | Promise<void>
  afterPaymentReconciliationPersist?(
    view: ActionInvocationView<DynamicPublishedInvocationResult>,
  ): void | Promise<void>
}>

export type DevelopmentHostCommandEvent = Readonly<{
  host: 'request_owned_human' | 'standalone_external_agent'
  phase: 'before' | 'after'
  command:
    | 'begin'
    | 'answer'
    | 'prepare'
    | 'correct'
    | 'decide'
    | 'continue'
    | 'recover'
    | 'request_cancellation'
  invocationRef?: string
  detail: Readonly<Record<string, StableHashValue>>
}>

export type DevelopmentHostCommandObserver = (event: DevelopmentHostCommandEvent) => void
export type DevelopmentHostObserverFailure = Readonly<{
  event: DevelopmentHostCommandEvent
  error: unknown
}>
export type DevelopmentHostObserverFailureSink = (failure: DevelopmentHostObserverFailure) => void

/**
 * Test/process adapters may use this sentinel to model loss of the host process.
 * Unlike an ordinary preparation failure, an uncatchable process interruption
 * cannot publish a durable not-released observation from the interrupted host.
 */
export class DevelopmentProcessInterruption extends Error {
  constructor(message = 'development_host_process_interrupted') {
    super(message)
    this.name = 'DevelopmentProcessInterruption'
  }
}

function bindHost(
  host: 'request_owned_human' | 'standalone_external_agent',
  adapter: DynamicPublishedActionInvocationAdapter,
  actor: InvocationActor,
  origin: ActionInvocationOrigin,
  sourceCommands: DevelopmentHostSourceCommands,
  observer: DevelopmentHostCommandObserver,
  observerFailureSink: DevelopmentHostObserverFailureSink,
): DevelopmentInvocationHost {
  const current = (invocationRef: string) => {
    const view = adapter.inspect(invocationRef)
    if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' } as const
    if (view.owner.callerRef !== actor.callerRef || view.owner.principalRef !== actor.principalRef) {
      return { kind: 'refused', code: 'cross_principal_refused', view } as const
    }
    return { kind: 'current', view } as const
  }
  const emit = (
    phase: DevelopmentHostCommandEvent['phase'],
    command: DevelopmentHostCommandEvent['command'],
    detail: Readonly<Record<string, StableHashValue>>,
    invocationRef?: string,
  ) => {
    const event = {
        host,
        phase,
        command,
        ...(invocationRef === undefined ? {} : { invocationRef }),
        detail,
      } satisfies DevelopmentHostCommandEvent
    try {
      observer(event)
    } catch (error) {
      // Command observers are diagnostic only. They must never change command truth,
      // including after a provider effect has already completed.
      try {
        observerFailureSink({ event, error })
      } catch {
        // The diagnostic sink is also observational and cannot affect command truth.
      }
    }
  }
  return Object.freeze({
    origin,
    actor,
    begin: (partial) => {
      emit('before', 'begin', { partial })
      const result = adapter.begin({ actor, origin, partial })
      emit('after', 'begin', { state: result.state, missingFields: result.missingFields }, result.invocationRef)
      return result
    },
    answer: (invocationRef, answers, freshnessMs) => {
      emit('before', 'answer', { answers, freshnessMs }, invocationRef)
      const result = adapter.answer({ invocationRef, actor, answers, freshnessMs })
      emit('after', 'answer', {
        state: 'control' in result ? result.control.state : result.state,
      }, invocationRef)
      return result
    },
    prepare: (value, freshnessMs) => {
      emit('before', 'prepare', { value, freshnessMs })
      const result = adapter.prepare({ actor, origin, value, freshnessMs })
      emit('after', 'prepare', { state: result.control.state }, result.invocationRef)
      return result
    },
    correct: (invocationRef, corrections, freshnessMs) => {
      emit('before', 'correct', { corrections, freshnessMs }, invocationRef)
      const result = adapter.correct({ invocationRef, actor, corrections, freshnessMs })
      emit('after', 'correct', {
        result: result.kind,
        ...(result.kind === 'refused' ? { code: result.code } : { state: result.view.control.state }),
      }, invocationRef)
      return result
    },
    decide: (invocationRef, accept) => {
      emit('before', 'decide', { accept }, invocationRef)
      const found = current(invocationRef)
      if (found.kind === 'refused') {
        emit('after', 'decide', { result: 'refused', code: found.code }, invocationRef)
        return found
      }
      if (found.view.authority === undefined) {
        const refused = { kind: 'refused', code: 'invalid_control_state', view: found.view } as const
        emit('after', 'decide', { result: 'refused', code: refused.code }, invocationRef)
        return refused
      }
      const result = adapter.decide({
        invocationRef,
        expectedInvocationVersion: found.view.invocationVersion,
        authorityRef: found.view.authority.reference,
        actor,
        origin,
        accept,
      })
      emit('after', 'decide', {
        result: result.kind,
        ...(result.kind === 'refused' ? { code: result.code } : { state: result.view.control.state }),
      }, invocationRef)
      return result
    },
    continue: async (invocationRef) => {
      emit('before', 'continue', {}, invocationRef)
      const found = current(invocationRef)
      if (found.kind === 'refused') {
        emit('after', 'continue', { result: 'refused', code: found.code }, invocationRef)
        return found
      }
      let view = found.view
      if (view.control.state === 'reconciliation_required') {
        const refused = { kind: 'refused', code: 'reconcile_before_retry', view } as const
        emit('after', 'continue', { result: 'refused', code: refused.code }, invocationRef)
        return refused
      }
      if (view.control.state === 'authorized' || view.control.state === 'retryable') {
        const acquired = adapter.acquire({
          invocationRef,
          expectedInvocationVersion: view.invocationVersion,
          authorityRef: view.authority!.reference,
          actor,
          origin,
          leaseOwner: sourceCommands.leaseOwner(host, invocationRef),
          leaseMs: 30_000,
        })
        if (acquired.kind === 'refused') {
          emit('after', 'continue', { result: 'refused', code: acquired.code }, invocationRef)
          return acquired
        }
        view = acquired.view
      }
      if (view.control.state !== 'leased') {
        const refused = { kind: 'refused', code: 'invalid_control_state', view } as const
        emit('after', 'continue', { result: 'refused', code: refused.code }, invocationRef)
        return refused
      }
      try {
        await sourceCommands.beforeExecute?.(view)
      } catch (error) {
        if (error instanceof DevelopmentProcessInterruption) throw error
        const abandoned = adapter.abandonAcquired({
          invocationRef,
          expectedInvocationVersion: view.invocationVersion,
          attemptRef: view.control.attemptRef,
          leaseOwner: view.control.leaseOwner,
          effectGeneration: view.control.effectGeneration,
        })
        const result: DevelopmentHostContinuation = abandoned.kind === 'accepted'
          ? {
              kind: 'refused',
              code: 'pre_execute_preparation_failed',
              view: abandoned.view,
            }
          : abandoned
        emit('after', 'continue', {
          result: result.kind,
          code: result.code,
          ...('view' in result ? { state: result.view?.control.state ?? 'missing' } : {}),
        }, invocationRef)
        return result
      }
      const executed = await adapter.executeAcquired({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: view.control.attemptRef,
        leaseOwner: view.control.leaseOwner,
        effectGeneration: view.control.effectGeneration,
      })
      const result: DevelopmentHostContinuation = executed.kind === 'accepted'
        ? { kind: 'completed', view: executed.view }
        : executed
      emit('after', 'continue', {
        result: result.kind,
        ...('view' in result ? { state: result.view?.control.state ?? 'missing' } : {}),
      }, invocationRef)
      return result
    },
    recover: (invocationRef, suppliedEvidence) => {
      emit('before', 'recover', {}, invocationRef)
      const found = current(invocationRef)
      if (found.kind === 'refused') {
        emit('after', 'recover', { result: 'refused', code: found.code }, invocationRef)
        return found
      }
      const view = found.view
      if (view.control.state !== 'reconciliation_required') {
        const refused = { kind: 'refused', code: 'invalid_control_state', view } as const
        emit('after', 'recover', { result: 'refused', code: refused.code }, invocationRef)
        return refused
      }
      const attemptRef = view.control.attemptRef
      const evidence = suppliedEvidence ?? sourceCommands.reconciliationEvidence(view)
      const attempt = view.attempts.find(
        (entry) => entry.attemptRef === attemptRef,
      )
      if (evidence === undefined || attempt === undefined) {
        const refused = { kind: 'refused', code: 'reconciliation_evidence_unavailable', view } as const
        emit('after', 'recover', { result: 'refused', code: refused.code }, invocationRef)
        return refused
      }
      const reconciled = adapter.reconcile({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: attempt.attemptRef,
        actor,
        origin,
        evidence,
      })
      const result: DevelopmentHostContinuation = reconciled.kind === 'accepted'
        ? { kind: 'reconciled', view: reconciled.view }
        : reconciled
      emit('after', 'recover', {
        result: result.kind,
        ...('view' in result ? { state: result.view?.control.state ?? 'missing' } : {}),
      }, invocationRef)
      return result
    },
    recoverPaidOperation: async (invocationRef, reconciliationEvidence, paymentEvidence) => {
      const found = current(invocationRef)
      if (found.kind === 'refused') return found
      const view = found.view
      if (view.control.state !== 'reconciliation_required') {
        return { kind: 'refused', code: 'invalid_control_state', view }
      }
      const control = view.control
      const paymentValidation = await adapter.reconcilePayment({
        evidence: paymentEvidence,
        persist: false,
      })
      if (paymentValidation.kind === 'refused') {
        return { kind: 'refused', code: 'reconciliation_evidence_unavailable', view }
      }
      const attempt = view.attempts.find(({ attemptRef }) => attemptRef === control.attemptRef)
      if (attempt === undefined) {
        return { kind: 'refused', code: 'reconciliation_evidence_unavailable', view }
      }
      const controlEvidenceRefusal = adapter.validateReconciliation({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: attempt.attemptRef,
        actor,
        origin,
        evidence: reconciliationEvidence,
      })
      if (controlEvidenceRefusal !== undefined) {
        return { kind: 'refused', code: controlEvidenceRefusal, view }
      }
      if (reconciliationEvidence.resolution !== 'released') {
        return { kind: 'refused', code: 'reconciliation_evidence_unavailable', view }
      }
      const payment = await adapter.reconcilePayment({ evidence: paymentEvidence })
      if (payment.kind === 'refused') {
        return { kind: 'refused', code: 'reconciliation_evidence_unavailable', view }
      }
      await sourceCommands.afterPaymentReconciliationPersist?.(view)
      const reconciled = adapter.reconcile({
        invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        attemptRef: attempt.attemptRef,
        actor,
        origin,
        evidence: reconciliationEvidence,
      })
      if (reconciled.kind === 'refused') return reconciled
      return { kind: 'reconciled', view: reconciled.view }
    },
    requestCancellation: (invocationRef) => {
      emit('before', 'request_cancellation', {}, invocationRef)
      const found = current(invocationRef)
      if (found.kind === 'refused') {
        emit('after', 'request_cancellation', { result: 'refused', code: found.code }, invocationRef)
        return found
      }
      const result = adapter.cancel({
        invocationRef,
        expectedInvocationVersion: found.view.invocationVersion,
        actor,
        origin,
      })
      emit('after', 'request_cancellation', {
        result: result.kind,
        ...(result.kind === 'refused' ? { code: result.code } : { state: result.view.control.state }),
      }, invocationRef)
      return result
    },
    inspect: adapter.inspect,
    projectRich: (invocationRef, expectedInvocationVersion) => {
      const projection = projectRichInvocationTask({
        invocationRef,
        expectedInvocationVersion,
        resolver: { resolve: () => JSON.parse(JSON.stringify(adapter.exportSnapshot())) },
      })
      assertProjectionBinding(projection.semantics.identity, actor, origin)
      return projection
    },
    projectStructured: (invocationRef, expectedInvocationVersion) => {
      const projection = projectStructuredInvocationTask({
        invocationRef,
        expectedInvocationVersion,
        resolver: { resolve: () => JSON.parse(JSON.stringify(adapter.exportSnapshot())) },
      })
      assertProjectionBinding(projection.semantics.identity, actor, origin)
      return projection
    },
    exportSnapshot: adapter.exportSnapshot,
  })
}

function assertProjectionBinding(
  identity: Readonly<{
    owner: InvocationActor
    origin: ActionInvocationOrigin
  }>,
  actor: InvocationActor,
  origin: ActionInvocationOrigin,
): void {
  if (identity.owner.callerRef !== actor.callerRef
    || identity.owner.principalRef !== actor.principalRef
    || JSON.stringify(identity.origin) !== JSON.stringify(origin)) {
    throw new Error('invocation_projection_host_binding_invalid')
  }
}

export type DevelopmentInvocationApplication = Readonly<{
  bindRequestOwned(input: Readonly<{
    actor: InvocationActor
    requestRef: string
    revision: number
  }>): DevelopmentInvocationHost
  bindStandalone(input: Readonly<{ actor: InvocationActor }>): DevelopmentInvocationHost
}>

export function createDevelopmentInvocationApplication(input: Readonly<{
  adapter: DynamicPublishedActionInvocationAdapter
  sourceCommands: DevelopmentHostSourceCommands
  observer?: DevelopmentHostCommandObserver
  observerFailureSink?: DevelopmentHostObserverFailureSink
}>): DevelopmentInvocationApplication {
  return Object.freeze({
    bindRequestOwned: ({ actor, requestRef, revision }) => bindRequestOwned({
      adapter: input.adapter,
      sourceCommands: input.sourceCommands,
      observer: input.observer ?? (() => undefined),
      observerFailureSink: input.observerFailureSink ?? (() => undefined),
      actor,
      requestRef,
      revision,
    }),
    bindStandalone: ({ actor }) => bindStandalone({
      adapter: input.adapter,
      sourceCommands: input.sourceCommands,
      observer: input.observer ?? (() => undefined),
      observerFailureSink: input.observerFailureSink ?? (() => undefined),
      actor,
    }),
  })
}

function bindRequestOwned(input: Readonly<{
  adapter: DynamicPublishedActionInvocationAdapter
  actor: InvocationActor
  requestRef: string
  revision: number
  sourceCommands: DevelopmentHostSourceCommands
  observer: DevelopmentHostCommandObserver
  observerFailureSink: DevelopmentHostObserverFailureSink
}>): DevelopmentInvocationHost {
  if (input.requestRef.length === 0 || !Number.isInteger(input.revision) || input.revision < 0) {
    throw new Error('request_owned_lineage_invalid')
  }
  return bindHost('request_owned_human', input.adapter, input.actor, {
    kind: 'request_owned',
    requestRef: input.requestRef,
    revision: input.revision,
  }, input.sourceCommands, input.observer, input.observerFailureSink)
}

function bindStandalone(input: Readonly<{
  adapter: DynamicPublishedActionInvocationAdapter
  actor: InvocationActor
  sourceCommands: DevelopmentHostSourceCommands
  observer: DevelopmentHostCommandObserver
  observerFailureSink: DevelopmentHostObserverFailureSink
}>): DevelopmentInvocationHost {
  return bindHost('standalone_external_agent', input.adapter, input.actor, {
    kind: 'standalone',
    callerRef: input.actor.callerRef,
    principalRef: input.actor.principalRef,
  }, input.sourceCommands, input.observer, input.observerFailureSink)
}
