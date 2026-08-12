import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniq } from 'es-toolkit/array'
import type { ActionContext } from '@/modules/common/action'

import {
  pricingConfigDigest,
  pricingConfigSchema,
  type ExactAmount,
  type MoneyInvocationPort,
} from '@/modules/money/public'
import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  DecisionRefusalCode,
  InMemoryControlSnapshot,
  InvocationActor,
  InvocationDecision,
  StandingMandateAuthorityBasis,
} from './contracts'
import { validateReconciliationEvidence, type ReconciliationEvidence } from './reconciliation-evidence'
import type { DevelopmentTimeoutSignal } from './attempts'
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
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlResult,
} from './internal/durable-contracts'
import { restoreDurableAttempt } from './internal/durable-contracts'
import type {
  DynamicPublishedSemanticClaim,
  DynamicPublishedSourceRow,
} from './dynamic-published-source'
import {
  copyDynamicPublishedSnapshot,
  verifyDynamicPublishedSnapshot,
  type DynamicPublishedSnapshotAnchors,
} from './dynamic-published-snapshot-verifier'
import {
  inspectUserInputContract,
  type InvocationInputHistory,
  type InvocationInputWork,
} from './input-work'
import { createDynamicPublishedInputApplication } from './input-application'
import {
  x402PaymentAttemptKey,
  type X402PaymentAttempt,
  type X402PaymentAttemptPort,
  type X402PaymentAuthorizationEvent,
} from './x402-payment-attempt'
import {
  validateX402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidence,
  type X402PaymentReconciliationEvidenceError,
  type X402PaymentReconciliationEvidenceVerifier,
} from './x402-payment-reconciliation-evidence'

export type DynamicPublishedAdapterSnapshot = Readonly<{
  format: 'dynamic-published-action-invocation:development:v4'
  sourceRows: readonly DynamicPublishedSourceRow[]
  semanticClaims: readonly DynamicPublishedSemanticClaim[]
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
  inputWork?: readonly InvocationInputWork[]
  inputHistory?: readonly InvocationInputHistory[]
  operations?: readonly PublishedOperation[]
  paymentAttempts: readonly X402PaymentAttempt[]
  paymentAuthorizationEvents: readonly X402PaymentAuthorizationEvent[]
}>

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
  initialSnapshot?: InMemoryControlSnapshot<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  >
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
  const executionTokens = new Map<string, DynamicPublishedExecutionToken>()
  const preparedTransports = new Map<string, DynamicPublishedPreparedTransport>()
  const moneyCharges = new Map<string, NonNullable<DynamicPublishedSourceRow['moneyCharge']>>()
  const semanticClaims = new Map<string, Readonly<{
    kind: 'owner' | 'reuse'
    semanticBaseKey: string
    semanticIdentityDigest: string
    outcome?: import('./dynamic-published-source').DynamicPublishedSharedOutcome
  }>>()
  const inputWork = new Map((input.inputWork ?? []).map((row) => [row.invocationRef, row]))
  const inputHistory = [...(input.inputHistory ?? [])]
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
      const preparation = await prepareDynamicPublishedTransport({
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
      const persisted = await durablePort.readControl(execution.invocationRef)
      const claim = input.source.claimSemanticEffect({
        semanticBaseKey: row.semanticBaseKey,
        semanticIdentityDigest: row.semanticIdentityDigest,
        principalRef: persisted?.control.owner.principalRef ?? '',
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
      // moneyLedger (authorizeInvocationCharge) is the single durable charging
      // authority for AE-internal per-call billing. Route-transport x402 payment is
      // the external provider-credential path and must never also charge this
      // invocation; the two seams operate on disjoint invocation types by design.
      if (input.moneyPort !== undefined) {
        const principalRef = persisted?.control.owner.principalRef
        if (principalRef === undefined || principalRef.length === 0) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'billing_identity_missing',
          }
        }
        const parsedPricingConfig = pricingConfigSchema.safeParse(input.operation.pricingConfig)
        if (!parsedPricingConfig.success) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'pricing_config_invalid',
          }
        }
        const pricingConfig = parsedPricingConfig.data
        const priceDigest = pricingConfigDigest(pricingConfig)
        if (priceDigest !== input.operation.priceDigest) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'price_changed',
          }
        }
        const existingCharge = row.moneyCharge
        if (existingCharge !== undefined && existingCharge.priceDigest !== input.operation.priceDigest) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'price_changed',
          }
        }
        const charge = existingCharge === undefined
          ? await input.moneyPort.authorizeInvocationCharge({
              principalId: principalRef,
              operationKey: value.operationKey,
              invocationRef: execution.invocationRef,
              attemptRef: execution.attemptRef,
              effectGeneration: execution.effectGeneration,
              capabilityContractDigest: input.operation.identity.contractDigest,
              businessId: input.operation.identity.businessId,
              offeringRef: input.operation.identity.offeringId,
              pricingConfig,
              priceDigest,
              priceSourceDigest: priceDigest,
              authorityMaximumSpend: pricingConfig.paidAmount,
            })
          : {
              kind: 'accepted' as const,
              chargeState: existingCharge.chargeState,
              amount: existingCharge.amount,
              priceDigest: existingCharge.priceDigest,
              usageRef: existingCharge.usageRef,
              observedAt: existingCharge.observedAt,
              ...(existingCharge.transactionRef === undefined ? {} : { transactionRef: existingCharge.transactionRef }),
            }
        if (charge.kind === 'refused') {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: descriptor.version,
            requestDigest: value.operationKey,
            failureCode: charge.code,
          }
        }
        const moneyCharge = {
          ...(charge.transactionRef === undefined ? {} : { transactionRef: charge.transactionRef }),
          usageRef: charge.usageRef,
          observedAt: charge.observedAt,
          principalId: principalRef,
          chargeState: charge.chargeState,
          amount: charge.amount,
          priceDigest: charge.priceDigest,
        }
        moneyCharges.set(key, moneyCharge)
        input.source.write({ ...row, moneyCharge })
      }
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
      const charge = moneyCharges.get(key)
      try {
        const result = await executeDynamicPublishedTransport({
          operation: input.operation,
          descriptor,
          prepared,
          runtime: input.runtime,
          paymentAttemptPort: input.paymentAttemptPort,
          now: input.now,
        })
        if (result.kind === 'published_operation_refused' && charge !== undefined && charge.chargeState === 'paid') {
          if (charge.transactionRef === undefined) throw new Error('published_operation_payment_reconciliation_required:transaction_missing')
          const refund = await input.moneyPort?.refundCharge?.({
            transactionRef: charge.transactionRef,
            principalId: charge.principalId,
            invocationRef: execution.invocationRef,
            attemptRef: execution.attemptRef,
            effectGeneration: execution.effectGeneration,
          })
          if (refund !== undefined && refund.kind === 'refused') {
            throw new Error('published_operation_payment_reconciliation_required:refund_refused')
          }
        }
        return result.kind === 'published_operation_succeeded' && charge !== undefined
          ? {
              ...result,
              usage: {
                usageRef: charge.usageRef,
                observedAt: charge.observedAt,
                chargeState: charge.chargeState,
                amount: charge.amount,
                priceDigest: charge.priceDigest,
                ...(charge.transactionRef === undefined ? {} : { transactionRef: charge.transactionRef }),
              },
            }
          : result
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const unknown = message.startsWith('published_operation_outcome_unknown:')
          || message.startsWith('published_operation_payment_reconciliation_required:')
        if (unknown && charge !== undefined) {
          if (charge.transactionRef === undefined) throw new Error('published_operation_payment_reconciliation_required:transaction_missing')
          await input.moneyPort?.markChargeOutcomeUnknown?.({
            transactionRef: charge.transactionRef,
            principalId: charge.principalId,
            invocationRef: execution.invocationRef,
            attemptRef: execution.attemptRef,
            effectGeneration: execution.effectGeneration,
          })
        }
        throw error
      }
    },
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

  return {
    descriptor,
    ...inputApplication,
    prepare: prepareValue,
    decide: tracer.decide,
    authorizeStandingMandateUse: tracer.authorizeStandingMandateUse,
    async acquire(request) {
      const materialInput = await materialFor(request.invocationRef)
      if (materialInput === undefined) return { kind: 'refused', code: 'invocation_not_found' }
      return tracer.acquire({ ...request, materialInput })
    },
    async executeAcquired(request) {
      const material = await materialFor(request.invocationRef)
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
    reconcile: tracer.reconcile,
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
    inspect: tracer.inspect,
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

export function loadDynamicPublishedAdapterSnapshot(
  snapshot: unknown,
  anchors: DynamicPublishedSnapshotAnchors,
): Readonly<{
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  developmentSnapshot: DevelopmentDurableState<DynamicPublishedInvocationResult>
  initialSnapshot: InMemoryControlSnapshot<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  >
  sourceRows: Map<string, DynamicPublishedSourceRow>
  semanticClaims: readonly DynamicPublishedSemanticClaim[]
  inputWork: readonly InvocationInputWork[]
  inputHistory: readonly InvocationInputHistory[]
  paymentAttempts: readonly X402PaymentAttempt[]
  paymentAuthorizationEvents: readonly X402PaymentAuthorizationEvent[]
}> {
  const verified = verifyDynamicPublishedSnapshot({ snapshot, anchors })
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
  const initialSnapshot: InMemoryControlSnapshot<
    DynamicPublishedInvocationInput,
    DynamicPublishedInvocationResult
  > = {
    format: 'action-invocation-control:development:v1',
    records: verified.controls.map((row) => ({
      sourceRef: row.sourceRef,
      control: {
        ...row.control,
        attempts: [...(durableState.attempts.get(row.invocationRef)?.values() ?? [])]
          .sort((left, right) => left.attemptNumber - right.attemptNumber)
          .map(restoreDurableAttempt),
      },
      ...(row.authorityBinding === undefined ? {} : { authorityBinding: row.authorityBinding }),
    })),
  }
  return {
    durablePort: createDevelopmentDurablePort(durableState),
    developmentSnapshot: durableState,
    initialSnapshot,
    sourceRows: new Map(verified.sourceRows.map((row) => [row.invocationRef, row])),
    semanticClaims: verified.semanticClaims,
    inputWork: verified.inputWork ?? [],
    inputHistory: verified.inputHistory ?? [],
    paymentAttempts: verified.paymentAttempts,
    paymentAuthorizationEvents: verified.paymentAuthorizationEvents,
  }
}
