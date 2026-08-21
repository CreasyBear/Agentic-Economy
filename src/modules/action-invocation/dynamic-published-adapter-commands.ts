import type { PublishedOperation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { uniq } from 'es-toolkit/array'

import type {
  ActionInvocationOrigin,
  DecisionRefusalCode,
  InvocationActor,
  InvocationDecision,
  StandingMandateAuthorityBasis,
} from './contracts'
import type {
  DynamicPublishedAdapterRuntime,
} from './dynamic-published-adapter-transact'
import { dynamicPublishedAdapterRuntimeKey } from './dynamic-published-adapter-transact'
import type { DynamicPublishedAdapterSnapshot } from './dynamic-published-adapter-snapshot'
import {
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type { DynamicPublishedExecutionToken } from './dynamic-published-execution'
import { copyDynamicPublishedSnapshot } from './dynamic-published-snapshot-verifier'
import {
  dynamicPublishedOperationSlot,
  type DynamicPublishedSourcePort,
} from './dynamic-published-source'
import type { DurableActionInvocationTracer } from './durable'
import { readCompletedResultIdentity, type CompletedResultIdentity } from './durable'
import type { DevelopmentDurableState } from './internal/development-durable-port'
import type { DurableActionInvocationPort } from './internal/durable-contracts'
import type {
  InvocationInputHistory,
  InvocationInputWork,
} from './input-work'
import { validateReconciliationEvidence, type ReconciliationEvidence } from './reconciliation-evidence'
import {
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAttemptPort,
} from './x402-payment-attempt'
import {
  validateX402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidenceError,
  type X402PaymentReconciliationEvidenceVerifier,
} from './x402-payment-reconciliation-evidence'

export function createDynamicPublishedAdapterCommands(input: Readonly<{
  operation: PublishedOperation
  source: DynamicPublishedSourcePort
  now: () => number
  issueProviderLease?: (input: Readonly<{
    invocationRef: string
    attemptRef: string
    effectGeneration: number
    authorityRef: string
    expiresAt: number
  }>) => Promise<DynamicPublishedExecutionToken['providerLease']>
  developmentSnapshot?: DevelopmentDurableState<DynamicPublishedInvocationResult>
  paymentAttemptPort: X402PaymentAttemptPort
  verifyPaymentReconciliationEvidence?: X402PaymentReconciliationEvidenceVerifier
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  tracer: DurableActionInvocationTracer<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  >
  materialFor: (
    invocationRef: string,
  ) => Promise<DynamicPublishedInvocationInput | undefined>
  adapterRuntime: DynamicPublishedAdapterRuntime
  inputWork: Map<string, InvocationInputWork>
  inputHistory: InvocationInputHistory[]
}>): Readonly<{
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
  readCompletedResult(
    invocationRef: string,
    actor: InvocationActor,
  ): Promise<CompletedResultIdentity>
  exportDevelopmentSnapshot(): DynamicPublishedAdapterSnapshot
}> {
  const durablePort = input.durablePort
  const tracer = input.tracer
  const { executionTokens, preparedTransports, semanticClaims } = input.adapterRuntime
  const runtimeKey = dynamicPublishedAdapterRuntimeKey
  const inputWork = input.inputWork
  const inputHistory = input.inputHistory

  return {
    async acquire(request) {
      const materialInput = await input.materialFor(request.invocationRef)
      if (materialInput === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      return tracer.acquire({ ...request, materialInput })
    },
    async executeAcquired(request) {
      const material = await input.materialFor(request.invocationRef)
      const persisted = await durablePort.readControl(request.invocationRef)
      const view = tracer.inspect(request.invocationRef)
      const authority = persisted?.control.authority
      if (
        material === undefined
        || persisted === undefined
        || view === undefined
        || authority === undefined
      ) {
        return { kind: 'refused', code: 'invocation_not_found' }
      }
      if (persisted.invocationVersion !== request.expectedInvocationVersion) {
        return { kind: 'refused', code: 'stale_invocation_version', view }
      }
      const persistedControl = persisted.control.control
      if (
        persistedControl.state !== 'leased'
        || persistedControl.attemptRef !== request.attemptRef
        || persistedControl.effectGeneration !== request.effectGeneration
        || persistedControl.leaseOwner !== request.leaseOwner
      ) {
        return { kind: 'refused', code: 'lease_not_current', view }
      }
      const sourceRow = input.source.read(persisted.sourceRef)
      const context = sourceRow?.context
      if (context === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      context.actionInvocationExecution = {
        invocationRef: request.invocationRef,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      }
      const key = runtimeKey(request.invocationRef, request.attemptRef, request.effectGeneration)
      const providerLease = input.issueProviderLease === undefined
        ? undefined
        : await input.issueProviderLease({
            invocationRef: request.invocationRef,
            attemptRef: request.attemptRef,
            effectGeneration: request.effectGeneration,
            authorityRef: authority.reference,
            expiresAt: Date.parse(authority.expiresAt),
          })
      if (input.operation.binding.authority.kind === 'provider_connection' && providerLease === undefined) {
        return { kind: 'refused', code: 'invalid_control_state', view }
      }
      executionTokens.set(key, {
        invocationRef: request.invocationRef,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
        authorityRef: authority.reference,
        mandateDigest: canonicalDigest(persisted.control.acceptedAuthority),
        grantDigest: canonicalDigest({
          acceptedAuthority: persisted.control.acceptedAuthority,
          owner: persisted.control.owner,
          origin: persisted.control.origin,
        }),
        expiresAt: Date.parse(authority.expiresAt),
        ...(providerLease === undefined ? {} : { providerLease }),
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
    async abandonAcquired(request) {
      return tracer.publishObservation({ ...request, release: 'not_released' })
    },
    async cancel(request) {
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
    validateReconciliation(request) {
      const view = tracer.inspect(request.invocationRef)
      if (view === undefined) return 'invocation_not_found'
      if (view.invocationVersion !== request.expectedInvocationVersion) {
        return 'stale_invocation_version'
      }
      if (view.owner.callerRef !== request.actor.callerRef
        || view.owner.principalRef !== request.actor.principalRef) {
        return 'cross_principal_refused'
      }
      if (stableStringify(view.origin) !== stableStringify(request.origin)) {
        return 'cross_origin_refused'
      }
      if (view.control.state !== 'reconciliation_required'
        || view.control.attemptRef !== request.attemptRef) {
        return 'invalid_control_state'
      }
      const attempt = view.attempts.find(({ attemptRef }) => attemptRef === request.attemptRef)
      const notBefore = attempt?.outcome.state === 'uncertain'
        || attempt?.outcome.state === 'timed_out'
        ? attempt.outcome.reconciliationRequiredAt
        : undefined
      if (attempt === undefined || notBefore === undefined) return 'invalid_control_state'
      return validateReconciliationEvidence({
        evidence: request.evidence,
        source: `published-operation:${input.operation.operationId}`,
        invocationRef: view.invocationRef,
        attemptRef: attempt.attemptRef,
        effectGeneration: attempt.effectGeneration,
        now: new Date(input.now()).toISOString(),
        notBefore,
        verifySourceEvidence: (evidence) =>
          evidence.source === `published-operation:${input.operation.operationId}`,
      })
    },
    async reconcilePayment({ evidence, persist = true }) {
      const key = x402PaymentAttemptKey(evidence)
      const current = input.paymentAttemptPort.load(key)
      if (current === undefined) return { kind: 'refused', code: 'payment_attempt_not_found' }
      const code = validateX402PaymentReconciliationEvidence({
        evidence,
        attempt: current,
        source: `x402:${current.providerEndpoint}`,
        now: input.now(),
        verifySourceEvidence: input.verifyPaymentReconciliationEvidence,
      })
      if (code !== undefined) return { kind: 'refused', code }
      if (current.state === 'not_settled' || current.state === 'settled') {
        return current.reconciliationEvidenceDigest === evidence.digest
          && current.reconciliationEvidenceRef === evidence.evidenceRef
          ? { kind: 'accepted', attempt: current }
          : { kind: 'refused', code: 'command_identity_conflict' }
      }
      if (current.state !== 'possibly_submitted' && current.state !== 'reconciliation_required') {
        return { kind: 'refused', code: 'payment_attempt_reconciliation_not_required' }
      }
      if (!persist) return { kind: 'accepted', attempt: current }
      const authorizationEvent = input.paymentAttemptPort.loadAuthorizationEvent(key)
      if (authorizationEvent === undefined) {
        return { kind: 'refused', code: 'payment_attempt_not_found' }
      }
      const attempt: X402PaymentAttempt = {
        ...current,
        state: evidence.resolution,
        observedAt: Date.parse(evidence.observedAt),
        evidenceRefs: uniq([evidence.evidenceRef, ...evidence.evidenceRefs]),
        reconciliationEvidenceRef: evidence.evidenceRef,
        reconciliationEvidenceDigest: evidence.digest,
        ...(evidence.settledAmount === undefined ? {} : { settledAmount: evidence.settledAmount }),
      }
      await input.paymentAttemptPort.persist({ attempt, authorizationEvent })
      return { kind: 'accepted', attempt }
    },
    async readCompletedResult(invocationRef, actor) {
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
    exportDevelopmentSnapshot() {
      const developmentSnapshot = input.developmentSnapshot
      if (developmentSnapshot === undefined) {
        throw new Error('development_snapshot_export_unavailable')
      }
      const snapshot: DynamicPublishedAdapterSnapshot = {
        format: 'dynamic-published-action-invocation:development:v4',
        sourceRows: input.source.list(),
        semanticClaims: input.source.listSemanticClaims(),
        controls: [...developmentSnapshot.controls.values()],
        attempts: [...developmentSnapshot.attempts].map(([invocationRef, rows]) => ({
          invocationRef,
          rows: [...rows.values()],
        })),
        history: [...developmentSnapshot.history].map(([invocationRef, rows]) => ({ invocationRef, rows })),
        commands: [...developmentSnapshot.commands].map(([commandId, value]) => ({
          commandId,
          value: {
            ...value,
            material: developmentSnapshot.commandMaterials.get(commandId) ?? null,
          },
        })),
        inputWork: [...inputWork.values()],
        inputHistory: [...inputHistory],
        operations: [input.operation],
        paymentAttempts: input.paymentAttemptPort.list(),
        paymentAuthorizationEvents: input.paymentAttemptPort.listAuthorizationEvents(),
      }
      return copyDynamicPublishedSnapshot(snapshot)
    },
  }
}
