import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { Agent } from 'undici'
import { v, type Infer, type ObjectType } from 'convex/values'
import {
  buildDynamicPublishedInput,
  createDynamicPublishedAction,
  type DynamicPublishedInvocationInput,
} from '@/modules/action-invocation/dynamic-published-contract'
import {
  createDurableActionInvocationTracer,
  readPublicInvocationStatus,
  cancelPublicInvocation,
  reconcilePublicInvocation,
  type ReconciliationEvidence,
} from '@/modules/action-invocation'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/public'
import {
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  reconciliationEvidenceValue,
  reconciliationValue,
  recoveryResultValue,
} from '@/modules/capability-execution/convex'
import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import {
  verifyExactEvmX402Settlement,
} from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { externalSpendIdentityMatchingReservationRef } from '@/modules/money/public'
import type { WorkId } from '@convex-dev/workpool'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import { marketDispatchWorkpool } from '../../../../convex/marketDispatchWorkpool'
import {
  cancelledRecoveryResult,
  canonicalPort,
  projectPersistedRecovery,
  projectPureOperationInvocationStatus,
  projectRecoveryOuter,
  reconciliationResult,
  recoveryNotFound,
  retryableRecoveryResult,
  type RecoveryRow,
} from '../../../../convex/capabilityOperationInvocationProjection'
import {
  brokeredChargeReservationForRecovery,
  finalizeBrokeredInvocationCharge,
  markBrokeredInvocationChargeOutcomeUnknown,
  reconcileAcceptedCharge,
  releaseBrokeredInvocationCharge,
} from './charge'
import { buildBrokeredX402Receipt } from './brokeredX402'
import {
  externalSpendPaymentFactsFromDispatch,
  readX402EvmReceipt,
} from './x402Route'

export const recoveryArgs = {
  invocationRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  mode: v.union(v.literal('status'), v.literal('cancel'), v.literal('reconcile'), v.literal('expire_authorization')),
  idempotencyKey: v.optional(v.string()),
  evidence: v.optional(v.union(reconciliationEvidenceValue, x402PaymentReconciliationEvidenceValue)),
} as const
type RecoveredInvocation = RecoveryRow & Readonly<{ grantRef: string }>
type RecoveryResult = Infer<typeof recoveryResultValue>
type ExpiryRecoveryResult = Extract<RecoveryResult, { kind: 'reconciliation_required' }>
type ExpiryQueueResult =
  | Readonly<{
      kind: 'queued'
      disposition: 'automatic'
      invocationRef: string
      operationRef: string
      evidence: Infer<typeof reconciliationValue>
    }>
  | Readonly<{
      kind: 'manual_review'
      disposition: 'manual_review'
      invocationRef: string
      operationRef: string
      evidence: Infer<typeof reconciliationValue>
    }>
  | Readonly<{ kind: 'not_queued' }>
type InternalRecoveryResult = RecoveryResult | (ExpiryRecoveryResult & Readonly<{
  expiryDisposition: 'automatic' | 'manual_review'
}>)

export async function recoverCapabilityOperationInvocation(
  ctx: ActionCtx,
  args: ObjectType<typeof recoveryArgs>,
): Promise<InternalRecoveryResult> {
  if (
    (args.mode === 'status' && (args.idempotencyKey !== undefined || args.evidence !== undefined))
    || (args.mode === 'cancel' && (args.idempotencyKey === undefined || args.evidence !== undefined))
    || (args.mode === 'reconcile' && (args.idempotencyKey !== undefined || args.evidence === undefined))
    || (args.mode === 'expire_authorization' && (args.idempotencyKey !== undefined || args.evidence !== undefined))
  ) return recoveryNotFound(args.invocationRef)
  const row = await ctx.runQuery(internal.capabilityOperationInvocations.readRecovery, {
    invocationRef: args.invocationRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
  })
  if (row === null) return recoveryNotFound(args.invocationRef)
  const recovered: RecoveredInvocation = row
  const port = canonicalPort(ctx)
  if (args.mode === 'cancel' && recovered.state !== 'pending') {
    return recovered.state === 'cancelled' ? cancelledRecoveryResult(recovered) : projectPersistedRecovery(recovered)
  }
  if (args.mode === 'cancel') {
    const idempotencyKey = args.idempotencyKey
    if (idempotencyKey === undefined) return recoveryNotFound(args.invocationRef)
    const decision = await ctx.runMutation(internal.capabilityOperationInvocations.cancelBeforeClaim, {
      invocationRef: recovered.invocationRef,
      principalId: recovered.principalId,
      credentialId: recovered.credentialId,
      idempotencyKey,
    })
    if (decision.kind === 'refused') return recoveryNotFound(args.invocationRef)
    if (decision.kind === 'cancelled') {
      if (decision.workId !== undefined) {
        await marketDispatchWorkpool.cancel(ctx, decision.workId as WorkId).catch(() => undefined)
      }
      return cancelledRecoveryResult(recovered)
    }
    if (decision.kind === 'reconciliation_required') {
      return {
        kind: 'reconciliation_required',
        invocationRef: recovered.invocationRef,
        operationRef: recovered.operationRef,
        evidence: {
          attemptRef: decision.attemptRef,
          effectGeneration: decision.effectGeneration,
          requiredAt: new Date(Date.now() + 1_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: `operation:${recovered.operationRef}`,
        },
      }
    }
  }
  const control = await port.readControl(recovered.invocationRef)
  if (control === undefined) {
    return projectPersistedRecovery(recovered)
  }
  if (
    control.control.owner.principalRef !== recovered.principalId
    || control.control.owner.callerRef !== recovered.credentialId
    || control.control.origin.kind !== 'standalone'
    || control.control.origin.principalRef !== recovered.principalId
    || control.control.origin.callerRef !== recovered.credentialId
    || control.control.invocationRef !== recovered.invocationRef
    || control.sourceRef !== `operation-invocation-source:${recovered.invocationRef}`
  ) return recoveryNotFound(args.invocationRef)
  if (args.mode === 'status') {
    const status = await readPublicInvocationStatus({
      port,
      invocationRef: recovered.invocationRef,
      actor: { callerRef: recovered.credentialId, principalRef: recovered.principalId },
    })
    if (status.kind === 'refused') return recoveryNotFound(args.invocationRef)
    return projectPureOperationInvocationStatus(recovered, status)
  }
  let operation: PublishedOperation
  let descriptor: RuntimePublishedOperationDescriptor
  let dynamicInput: DynamicPublishedInvocationInput
  try {
    const parsedOperation = parsePublishedOperationSnapshot(recovered.operationJson)
    if (parsedOperation === undefined) throw new Error('operation_invalid')
    operation = parsedOperation
    descriptor = materializeRuntimePublishedOperation(operation)
    const parsedInput: unknown = JSON.parse(recovered.inputJson)
    if (!isBoundedJsonValue(parsedInput)) throw new Error('input_invalid')
    dynamicInput = buildDynamicPublishedInput({
      operation,
      descriptor,
      value: parsedInput,
    })
  } catch {
    return recoveryNotFound(args.invocationRef)
  }
  if (
    operation.operationId !== recovered.operationRef
    || dynamicInput.inputDigest !== recovered.inputDigest
    || (control.preparedMaterialDigest !== undefined && control.preparedMaterialDigest !== dynamicInput.inputDigest)
    || control.control.action.id !== operation.operationId
    || control.control.action.contractVersion !== descriptor.version
  ) return recoveryNotFound(args.invocationRef)
  const priceAmount = descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined
  if (priceAmount === undefined) return recoveryNotFound(args.invocationRef)

  const [attemptRows, historyRows] = await Promise.all([
    port.readAttempts(recovered.invocationRef, 100),
    port.readHistory(recovered.invocationRef, 0, 100),
  ])
  if (historyRows.some(({ invocationRef }) => invocationRef !== recovered.invocationRef)) {
    return recoveryNotFound(args.invocationRef)
  }
  const attempts = attemptRows.map(({ invocationRef: _invocationRef, recordedAt: _recordedAt, ...attempt }) => attempt)
  const prepared = {
    materialInputDigest: dynamicInput.inputDigest,
    target: dynamicInput.target,
    consequence: descriptor.consequenceClass,
    dataUse: {
      fields: descriptor.materialInputPointers,
      limits: { amount: priceAmount },
    },
    preparedAt: control.authorityDecisionAt ?? control.updatedAt,
    freshUntil: control.control.authority?.expiresAt ?? control.updatedAt,
  }
  const action = createDynamicPublishedAction({
    operation,
    descriptor,
    now: () => Date.now(),
    run: async (value) => ({
      kind: 'published_operation_refused' as const,
      sourceDisposition: 'refused' as const,
      operationId: operation.operationId,
      operationVersion: descriptor.version,
      requestDigest: value.inputDigest,
      failureCode: 'recovery_control_only',
    }),
    preReleaseCheck: async (value) => ({
      kind: 'published_operation_refused' as const,
      sourceDisposition: 'refused' as const,
      operationId: operation.operationId,
      operationVersion: descriptor.version,
      requestDigest: value.inputDigest,
      failureCode: 'recovery_control_only',
    }),
  })
  const x402Attempt = operation.identity.adapterId === 'x402-fetch:v2'
    && control.currentAttemptRef !== undefined
    && control.currentEffectGeneration !== undefined
    ? await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAttempt, {
        dispatchRef: recovered.invocationRef,
        attemptRef: control.currentAttemptRef,
        effectGeneration: control.currentEffectGeneration,
      })
    : null
  const brokeredReservation = operation.identity.adapterId === 'x402-fetch:v2'
    && args.mode !== 'expire_authorization'
    && recovered.environment === 'production'
    ? await brokeredChargeReservationForRecovery(ctx, {
        operation,
        dispatch: recovered,
        durableAttemptRef: control.currentAttemptRef ?? recovered.attemptRef ?? `operation-attempt:${recovered.invocationRef}:1`,
      })
    : undefined
  const brokeredReceipt = (
    state: 'settled' | 'refunded' | 'reconciliation_required',
    evidenceHash: string,
    issuedAt: string,
    externalSettlementRef?: string,
    settlementTransactionHash?: string,
    paymentIdentifier?: string,
    refundState?: OperationInvokeReceipt['refundState'],
    lossState?: OperationInvokeReceipt['lossState'],
  ) => brokeredReservation === undefined
    ? undefined
    : buildBrokeredX402Receipt({
        operation,
        invocationRef: recovered.invocationRef,
        operationRef: recovered.operationRef,
        state,
        evidenceHash,
        issuedAt,
        ...(brokeredReservation.charge.transactionRef === undefined ? {} : { transactionRef: brokeredReservation.charge.transactionRef }),
        ...(externalSettlementRef === undefined ? {} : { externalSettlementRef }),
        ...(settlementTransactionHash === undefined ? {} : { settlementTransactionHash }),
        ...(paymentIdentifier === undefined ? {} : { paymentIdentifier }),
        ...(brokeredReservation.charge.transactionRef === undefined ? {} : { accountingTransactionRefs: [brokeredReservation.charge.transactionRef] }),
        ...(refundState === undefined ? {} : { refundState }),
        ...(lossState === undefined ? {} : { lossState }),
      })
  const initialSnapshot = {
    format: 'action-invocation-control:development:v1' as const,
    records: [{
      sourceRef: control.sourceRef,
      control: { ...control.control, attempts },
      ...(control.authorityBinding === undefined ? {} : { authorityBinding: control.authorityBinding }),
    }],
  }
  let trustedReconciliationEvidenceDigest: string | undefined
  const tracer = createDurableActionInvocationTracer({
    action,
    port,
    now: () => new Date().toISOString(),
    nextInvocationRef: () => recovered.invocationRef,
    nextAuthorityRef: () => `operation-authority:${recovered.invocationRef}`,
    nextAttemptRef: () => `${recovered.invocationRef}:recovery`,
    resolveSourceState: (sourceRef) => {
      if (sourceRef !== control.sourceRef) throw new Error('operation_recovery_source_ref_mismatch')
      return {
        input: dynamicInput,
        context: {},
        prepared,
        observedResolution: { state: 'pending' as const },
      }
    },
    verifyReconciliationEvidence: (evidence: ReconciliationEvidence): boolean => {
      if (
        evidence.operationRef !== recovered.operationRef
        || evidence.inputDigest !== recovered.inputDigest
        || evidence.providerIdentity !== (
          operation.binding.authority.kind === 'provider_connection'
            ? operation.binding.authority.providerRef
            : undefined
        )
      ) return false
      return canonicalDigest(evidence as StableHashValue)
        === trustedReconciliationEvidenceDigest
        || historyRows.some((history) =>
          history.sourceEvidenceRef === evidence.evidenceRef
          && history.observation?.release === evidence.resolution
          && history.observation?.evidenceDigest === evidence.digest)
    },
  }, initialSnapshot)
  if (args.mode === 'expire_authorization') {
    if (operation.identity.adapterId !== 'x402-fetch:v2' || x402Attempt === null) {
      return recoveryNotFound(args.invocationRef)
    }
    const canonicalControl = control.control.control
    const attemptRef = control.currentAttemptRef
    const effectGeneration = control.currentEffectGeneration
    const observedControlState = canonicalControl.state
    let controlInvocationVersion = control.control.invocationVersion
    let nativeTransition: 'applied' | 'replayable' | 'manual_review' = 'manual_review'
    if (
      attemptRef !== undefined
      && effectGeneration !== undefined
      && canonicalControl.state === 'reconciliation_required'
    ) {
      nativeTransition = 'replayable'
    } else if (
      attemptRef !== undefined
      && effectGeneration !== undefined
      && canonicalControl.state === 'leased'
      && canonicalControl.attemptRef === attemptRef
      && canonicalControl.effectGeneration === effectGeneration
      && canonicalControl.leaseOwner !== undefined
    ) {
      try {
        const observation = await tracer.publishObservation({
          invocationRef: recovered.invocationRef,
          expectedInvocationVersion: control.control.invocationVersion,
          attemptRef,
          leaseOwner: canonicalControl.leaseOwner,
          effectGeneration,
          release: 'possibly_released',
        })
        if (observation.kind === 'accepted') {
          nativeTransition = 'applied'
          controlInvocationVersion = observation.view.invocationVersion
        }
      } catch {
        nativeTransition = 'manual_review'
      }
    }
    if (attemptRef === undefined || effectGeneration === undefined) {
      return recoveryNotFound(args.invocationRef)
    }
    let queued: ExpiryQueueResult
    try {
      queued = await ctx.runMutation(internal.capabilityOperationX402AuthorizationExpiry.queueExpiredX402Authorization, {
        invocationRef: recovered.invocationRef,
        principalId: recovered.principalId,
        credentialId: recovered.credentialId,
        attemptRef,
        effectGeneration,
        custodyRef: x402Attempt.custodyRef,
        authorizationDigest: x402Attempt.authorizationDigest,
        ...(x402Attempt.reservationRef === undefined ? {} : { reservationRef: x402Attempt.reservationRef }),
        nativeTransition,
        controlInvocationVersion,
        observedControlState,
        now: Date.now(),
      })
    } catch {
      return recoveryNotFound(args.invocationRef)
    }
    if (queued.kind === 'not_queued' || queued.disposition === undefined) return recoveryNotFound(args.invocationRef)
    return {
      kind: 'reconciliation_required',
      invocationRef: queued.invocationRef,
      operationRef: queued.operationRef,
      evidence: queued.evidence,
      expiryDisposition: queued.disposition,
    }
  }
  const actor = { callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const origin = { kind: 'standalone' as const, callerRef: recovered.credentialId, principalRef: recovered.principalId }
  const reconcileMoney = async (
    outcome: 'not_released' | 'released',
  ): Promise<{ kind: 'none' | 'settled' | 'reconciliation_required' }> => {
    const attemptRef = control.currentAttemptRef
      ?? recovered.attemptRef
      ?? `operation-attempt:${recovered.invocationRef}:1`
    // Check the deterministic buyer transaction before reconstructing the
    // brokered reservation. A claimed invocation can be cancelled in the
    // window before the buyer reservation is written; in that case the
    // canonical reconciliation mutation returns `none`, which is a safe
    // no-effect outcome rather than a reason to manufacture a reservation.
    const deterministicBuyerSettlement = await reconcileAcceptedCharge(
      ctx,
      recovered,
      operation,
      {
        chargeState: 'paid',
        transactionRef: `operation-money:${recovered.invocationRef}:${attemptRef}:1`,
      },
      attemptRef,
      outcome,
    )
    if (deterministicBuyerSettlement.kind === 'settled') return { kind: 'settled' }
    if (brokeredReservation !== undefined) {
      const settlement = outcome === 'not_released'
        ? await releaseBrokeredInvocationCharge(ctx, brokeredReservation)
        : { kind: 'reconciliation_required' as const }
      return settlement.kind === 'reconciliation_required'
        ? { kind: 'reconciliation_required' }
        : { kind: 'settled' }
    }
    return { kind: 'reconciliation_required' }
  }

  if (args.mode === 'cancel') {
    const idempotencyKey = args.idempotencyKey
    if (idempotencyKey === undefined) return recoveryNotFound(args.invocationRef)
    const cancellation = await cancelPublicInvocation({
      tracer,
      invocationRef: recovered.invocationRef,
      idempotencyKey,
      actor,
      origin,
    })
    if (cancellation.kind === 'refused') {
      if (cancellation.status === undefined) return recoveryNotFound(args.invocationRef)
      const result = projectPureOperationInvocationStatus(recovered, cancellation.status)
      await projectRecoveryOuter(ctx, recovered, result, undefined)
      return result
    }
    if (cancellation.kind === 'cancelled') {
      const money = await reconcileMoney('not_released')
      if (money.kind === 'reconciliation_required') {
        const reconciliation = reconciliationResult(recovered, cancellation.status, attemptRows, operation.operationId)
        await projectRecoveryOuter(ctx, recovered, reconciliation, 'reconciliation_required')
        return reconciliation
      }
      const cancelled = cancelledRecoveryResult(recovered)
      await projectRecoveryOuter(ctx, recovered, cancelled, 'cancelled', {
        clearResult: true,
        clearWorkId: true,
        clearAttemptRef: true,
        clearEvidenceHash: true,
      })
      return cancelled
    }
    const reconciliation = reconciliationResult(recovered, cancellation.status, attemptRows, operation.operationId)
    await projectRecoveryOuter(ctx, recovered, reconciliation, 'reconciliation_required')
    return reconciliation
  }
  const submittedEvidence = args.evidence
  if (submittedEvidence === undefined) return recoveryNotFound(args.invocationRef)
  let evidence: ReconciliationEvidence
  let x402MoneyReconciled = false
  let brokeredReconciliationReceipt: OperationInvokeReceipt | undefined
  let brokeredOutcomeReceipt: OperationInvokeReceipt | undefined
  if (submittedEvidence.kind === 'x402_payment_reconciliation') {
    const paymentStatus = await readPublicInvocationStatus({
      port,
      invocationRef: recovered.invocationRef,
      actor,
    })
    if (paymentStatus.kind === 'refused') return recoveryNotFound(args.invocationRef)
    const x402ReconciliationReceipt = brokeredReceipt(
      'reconciliation_required',
      submittedEvidence.digest,
      submittedEvidence.observedAt,
      undefined,
      undefined,
      submittedEvidence.paymentIdentifier,
      'unknown',
      'unknown',
    )
    brokeredReconciliationReceipt = x402ReconciliationReceipt
    const providerRef = operation.binding.authority.kind === 'provider_connection'
      ? operation.binding.authority.providerRef
      : undefined
    const externalIdentity = x402Attempt === null || providerRef === undefined
      ? undefined
      : externalSpendIdentityMatchingReservationRef(
          externalSpendPaymentFactsFromDispatch({
            invocationRef: recovered.invocationRef,
            principalId: recovered.principalId,
            credentialId: recovered.credentialId,
            grantRef: recovered.grantRef,
            grantGeneration: recovered.grantGeneration,
            environment: recovered.environment,
            operationRef: recovered.operationRef,
          }, {
            attemptRef: submittedEvidence.attemptRef,
            effectGeneration: submittedEvidence.effectGeneration,
            providerRef,
            paymentIdentifier: submittedEvidence.paymentIdentifier,
            challengeDigest: submittedEvidence.challengeDigest,
            amount: submittedEvidence.amount,
          }),
          submittedEvidence.reservationRef,
        )
    const observedAt = Date.parse(submittedEvidence.observedAt)
    const { digest: submittedDigest, ...submittedMaterial } = submittedEvidence
    if (
      operation.identity.adapterId !== 'x402-fetch:v2'
      || x402Attempt === null
      || externalIdentity === undefined
      || submittedEvidence.invocationRef !== recovered.invocationRef
      || submittedEvidence.operationRef !== recovered.operationRef
      || submittedEvidence.inputDigest !== recovered.inputDigest
      || submittedEvidence.amount.units !== x402Attempt.amountUnits
      || submittedEvidence.amount.currency !== x402Attempt.currency
      || submittedEvidence.amount.exponent !== x402Attempt.exponent
      || providerRef !== submittedEvidence.providerRef
      || !/^0x[0-9a-fA-F]{64}$/.test(submittedEvidence.transactionHash)
      || (
        x402Attempt.paymentResponseDigest !== undefined
        && x402Attempt.paymentResponseDigest !== submittedEvidence.paymentResponseDigest
      )
      || !Number.isFinite(observedAt)
      || canonicalDigest(submittedMaterial as StableHashValue) !== submittedDigest
    ) {
      const required = reconciliationResult(recovered, paymentStatus, attemptRows, operation.operationId, x402ReconciliationReceipt)
      await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
      return required
    }
    let settlementVerified = false
    const paymentPayer = x402Attempt.paymentPayer
    const paymentNonce = x402Attempt.paymentNonce
    if (paymentPayer !== undefined && paymentNonce !== undefined) {
      const dispatcher = new Agent({
        connect: { lookup: createGuardedLookup(defaultDnsResolver) },
      })
      try {
        const receipt = await readX402EvmReceipt(
          x402Attempt.network,
          submittedEvidence.transactionHash,
          dispatcher,
          recovered.environment,
          paymentPayer,
          paymentNonce,
        ).catch(() => undefined)
        const response = {
          success: true,
          transaction: submittedEvidence.transactionHash,
          network: x402Attempt.network,
          amount: x402Attempt.amountUnits,
          payer: paymentPayer,
        }
        const requirement = {
          scheme: x402Attempt.scheme,
          network: x402Attempt.network,
          amount: x402Attempt.amountUnits,
          asset: x402Attempt.asset,
          payTo: x402Attempt.payTo,
        }
        if (submittedEvidence.settlementStatus === 'settled') {
          settlementVerified = verifyExactEvmX402Settlement({
            response,
            requirement,
            payer: paymentPayer,
            paymentNonce,
            receipt,
          })
        } else if (
          receipt !== undefined
          && receipt.confirmations >= 12n
          && receipt.authorizationState === false
          && (
            receipt.status === 'reverted'
            || !verifyExactEvmX402Settlement({
              response,
              requirement,
              payer: paymentPayer,
              paymentNonce,
              receipt: { ...receipt, authorizationState: true },
            })
          )
        ) {
          settlementVerified = true
        }
      } finally {
        await dispatcher.close().catch(() => undefined)
      }
    }
    if (!settlementVerified) {
      const required = reconciliationResult(
        recovered,
        paymentStatus,
        attemptRows,
        operation.operationId,
        x402ReconciliationReceipt,
      )
      await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
      return required
    }
    const payment = await ctx.runMutation(
      internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt,
      {
        dispatchRef: recovered.invocationRef,
        attemptRef: submittedEvidence.attemptRef,
        effectGeneration: submittedEvidence.effectGeneration,
        operationRef: submittedEvidence.operationRef,
        inputDigest: submittedEvidence.inputDigest,
        evidenceRef: submittedEvidence.evidenceRef,
        evidenceDigest: submittedEvidence.digest,
        reservationRef: submittedEvidence.reservationRef,
        paymentIdentifier: submittedEvidence.paymentIdentifier,
        challengeDigest: submittedEvidence.challengeDigest,
        settlementStatus: submittedEvidence.settlementStatus,
        amountUnits: submittedEvidence.amount.units,
        currency: submittedEvidence.amount.currency,
        exponent: submittedEvidence.amount.exponent,
        paymentResponseDigest: submittedEvidence.paymentResponseDigest,
        transportObservationDigest: submittedEvidence.transportObservationDigest,
        transportRequestDigest: submittedEvidence.requestDigest,
        paymentObservationDigest: submittedEvidence.paymentObservationDigest,
        observedAt,
      },
    )
    const external = payment.kind === 'settled'
      ? await ctx.runMutation(internal.moneyLedger.reconcileExternalInvocationSpend, {
          ...externalIdentity,
          settlementStatus: submittedEvidence.settlementStatus,
          paymentResponseDigest: submittedEvidence.paymentResponseDigest,
          evidenceRef: submittedEvidence.evidenceRef,
          evidenceDigest: submittedEvidence.digest,
          observedAt,
        })
      : { kind: 'refused' as const }
    const brokeredMoney = brokeredReservation === undefined
      ? { kind: 'settled' as const }
      : payment.kind !== 'settled' || external.kind !== 'accepted'
        ? await markBrokeredInvocationChargeOutcomeUnknown(ctx, brokeredReservation)
        : submittedEvidence.settlementStatus === 'settled'
          ? await finalizeBrokeredInvocationCharge(
              ctx,
              brokeredReservation,
              submittedEvidence.transactionHash,
              [submittedEvidence.evidenceRef, submittedEvidence.digest],
            )
          : await releaseBrokeredInvocationCharge(
              ctx,
              brokeredReservation,
              [submittedEvidence.evidenceRef, submittedEvidence.digest],
            )
    if (payment.kind !== 'settled' || external.kind !== 'accepted' || brokeredMoney.kind === 'reconciliation_required') {
      const required = reconciliationResult(recovered, paymentStatus, attemptRows, operation.operationId, x402ReconciliationReceipt)
      await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
      return required
    }
    const evidenceMaterial = {
      kind: 'action_invocation_reconciliation' as const,
      version: 1 as const,
      evidenceRef: submittedEvidence.evidenceRef,
      source: submittedEvidence.source,
      invocationRef: submittedEvidence.invocationRef,
      attemptRef: submittedEvidence.attemptRef,
      effectGeneration: submittedEvidence.effectGeneration,
      operationRef: submittedEvidence.operationRef,
      inputDigest: submittedEvidence.inputDigest,
      requestDigest: submittedEvidence.requestDigest,
      providerIdentity: submittedEvidence.providerRef,
      paymentIdentifier: submittedEvidence.paymentIdentifier,
      transportObservationDigest: submittedEvidence.transportObservationDigest,
      paymentObservationDigest: submittedEvidence.paymentObservationDigest,
      resolution: submittedEvidence.settlementStatus === 'settled'
        ? 'released' as const
        : 'not_released' as const,
      observedAt: submittedEvidence.observedAt,
    }
    evidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial as StableHashValue),
    }
    brokeredOutcomeReceipt = brokeredReceipt(
      submittedEvidence.settlementStatus === 'settled' ? 'settled' : 'refunded',
      evidence.digest,
      evidence.observedAt,
      submittedEvidence.settlementStatus === 'settled' ? submittedEvidence.transactionHash : undefined,
      submittedEvidence.settlementStatus === 'settled' ? submittedEvidence.transactionHash : undefined,
      submittedEvidence.paymentIdentifier,
      submittedEvidence.settlementStatus === 'settled' ? 'not_applicable' : 'released',
      'none',
    )
    trustedReconciliationEvidenceDigest = canonicalDigest(evidence as StableHashValue)
    x402MoneyReconciled = true
  } else {
    evidence = submittedEvidence
  }
  const reconciliation = await reconcilePublicInvocation({
    tracer,
    invocationRef: recovered.invocationRef,
    attemptRef: evidence.attemptRef,
    actor,
    origin,
    evidence,
  })
  if (reconciliation.kind === 'refused') {
    if (reconciliation.status === undefined) return recoveryNotFound(args.invocationRef)
    const result = projectPureOperationInvocationStatus(recovered, reconciliation.status)
    await projectRecoveryOuter(ctx, recovered, result, undefined)
    return result.kind === 'found' && brokeredOutcomeReceipt !== undefined
      ? { ...result, receipt: brokeredOutcomeReceipt }
      : result
  }
  if (operation.identity.adapterId === 'x402-fetch:v2' && !x402MoneyReconciled) {
    const required = reconciliationResult(
      recovered,
      reconciliation.status,
      attemptRows,
      operation.operationId,
      brokeredReconciliationReceipt,
    )
    await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
    return required
  }
  const money = operation.identity.adapterId === 'x402-fetch:v2'
    ? { kind: 'settled' as const, outcome: evidence.resolution }
    : await reconcileMoney(evidence.resolution)
  if (money.kind === 'reconciliation_required') {
    const required = reconciliationResult(
      recovered,
      reconciliation.status,
      attemptRows,
      operation.operationId,
      brokeredReconciliationReceipt,
    )
    await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
    return required
  }

  if (evidence.resolution === 'released') {
    const outcome = reconciliationResult(
      recovered,
      reconciliation.status,
      attemptRows,
      operation.operationId,
      brokeredOutcomeReceipt,
    )
    await projectRecoveryOuter(ctx, recovered, outcome, 'reconciliation_required')
    return outcome
  }
  if (reconciliation.status.control !== 'retryable') {
    const required = reconciliationResult(
      recovered,
      reconciliation.status,
      attemptRows,
      operation.operationId,
      brokeredOutcomeReceipt,
    )
    await projectRecoveryOuter(ctx, recovered, required, 'reconciliation_required')
    return required
  }
  const retryable = retryableRecoveryResult(recovered, brokeredOutcomeReceipt)
  await projectRecoveryOuter(ctx, recovered, retryable, 'pending', {
    clearResult: true,
    clearWorkId: true,
    clearAttemptRef: true,
    clearEvidenceHash: true,
    clearDispatchState: true,
  })
  return retryable
}
