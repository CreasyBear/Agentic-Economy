import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  invokePreparedRouteTransport,
  type RouteTransportObservation,
  type RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import {
  normalizePricingConfig,
  pricingConfigDigest,
} from '@/modules/money/public'
import {
  operationInvokeReceiptAsset,
  type OperationInvokeReceipt,
} from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionCtx } from '../../../../convex/_generated/server'
import type { CanonicalClaimSnapshot } from '@/modules/action-invocation'
import {
  canonicalTerminalOutcome,
  finalizeOperationDispatch,
  type ChargeSettlementResult,
  type ContractOutputValidation,
  type OpenDispatch,
  type WorkerAcceptedCharge,
  parseContractOutput,
} from '../../../../convex/capabilityOperationInvocationProjection'
import {
  finalizeBrokeredInvocationCharge,
  markBrokeredInvocationChargeOutcomeUnknown,
  recordBrokeredInvalidOutputLoss,
  releaseBrokeredInvocationCharge,
  type BrokeredChargeReservation,
} from './charge'
import {
  finalizeX402ExternalSpend,
  recordX402TransportObservation,
  reverseX402ExternalSpendForInvalidOutput,
} from './x402Route'

export function buildBrokeredX402Receipt(input: Readonly<{
  operation: PublishedOperation
  invocationRef: string
  operationRef: string
  state: OperationInvokeReceipt['state']
  evidenceHash: string
  issuedAt: string
  transactionRef?: string
  settlementTransactionHash?: string
  paymentIdentifier?: string
  accountingTransactionRefs?: readonly string[]
  refundState?: OperationInvokeReceipt['refundState']
  lossState?: OperationInvokeReceipt['lossState']
  externalSettlementRef?: string
}>): OperationInvokeReceipt | undefined {
  const identityPricing = normalizePricingConfig(input.operation.identity.pricingConfig)
  const operationPricing = normalizePricingConfig(input.operation.pricingConfig)
  if (
    identityPricing.kind === 'invalid'
    || operationPricing.kind === 'invalid'
    || identityPricing.config.providerAmount === undefined
    || identityPricing.config.platformFee === undefined
    || operationPricing.config.providerAmount === undefined
    || operationPricing.config.platformFee === undefined
    || pricingConfigDigest(identityPricing.config) !== input.operation.identity.priceDigest
    || pricingConfigDigest(operationPricing.config) !== input.operation.priceDigest
    || input.operation.identity.priceDigest !== input.operation.priceDigest
    || pricingConfigDigest(identityPricing.config) !== pricingConfigDigest(operationPricing.config)
    || input.operation.identity.payment.kind !== 'x402'
    || input.operation.identity.payment.network !== 'eip155:8453'
    || input.operation.identity.payment.asset.toLowerCase() !== operationInvokeReceiptAsset.toLowerCase()
    || input.evidenceHash.trim().length === 0
    || input.issuedAt.trim().length === 0
  ) return undefined
  const providerQuotedAmount = identityPricing.config.providerAmount
  const agenticEconomyFee = identityPricing.config.platformFee
  const totalBuyerAuthorization = identityPricing.config.paidAmount
  const receiptIdentity = {
    format: 'operation-invoke-receipt:v1',
    invocationRef: input.invocationRef,
    operationRef: input.operationRef,
    priceDigest: input.operation.priceDigest,
    providerQuotedAmount,
    agenticEconomyFee,
    totalBuyerAuthorization,
  } as StableHashValue
  return {
    receiptRef: `receipt:${canonicalDigest(receiptIdentity)}`,
    state: input.state,
    network: 'eip155:8453',
    asset: operationInvokeReceiptAsset,
    providerQuotedAmount,
    agenticEconomyFee,
    totalBuyerAuthorization,
    priceDigest: input.operation.priceDigest,
    ...(input.transactionRef === undefined ? {} : { transactionRef: input.transactionRef }),
    ...(input.settlementTransactionHash === undefined ? {} : { settlementTransactionHash: input.settlementTransactionHash }),
    ...(input.paymentIdentifier === undefined ? {} : { paymentIdentifier: input.paymentIdentifier }),
    ...(input.accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs: [...input.accountingTransactionRefs] }),
    ...(input.refundState === undefined ? {} : { refundState: input.refundState }),
    ...(input.lossState === undefined ? {} : { lossState: input.lossState }),
    ...(input.externalSettlementRef === undefined ? {} : { externalSettlementRef: input.externalSettlementRef }),
    evidenceHash: input.evidenceHash,
    issuedAt: input.issuedAt,
  }
}

export async function runBrokeredX402Transport(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    descriptor: Parameters<typeof parseContractOutput>[1]
    prepared: Parameters<typeof invokePreparedRouteTransport>[0]
    runtime: RouteTransportRuntime
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
    reservation: BrokeredChargeReservation
    money: WorkerAcceptedCharge
    fenced: CanonicalClaimSnapshot
  }>,
): Promise<RouteTransportObservation> {
  let observation: RouteTransportObservation
  try {
    observation = await invokePreparedRouteTransport(input.prepared, input.runtime)
  } catch (error) {
    observation = {
      transport: 'unknown',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: input.prepared.requestDigest,
      failureCode: `operation_transport_${errorName(error)}`,
    }
  }
  const outputValidation = parseContractOutput(observation, input.descriptor)
  const settlement = await settleBrokeredX402Observation(ctx, {
    dispatch: input.dispatch,
    operation: input.operation,
    observation,
    durableAttemptRef: input.durableAttemptRef,
    durableEffectGeneration: input.durableEffectGeneration,
    operationKeyDigest: input.operationKeyDigest,
    reservation: input.reservation,
    outputValidation,
  })
  await projectBrokeredX402OuterResult(
    ctx,
    input.dispatch,
    input.operation,
    observation,
    new Date().toISOString(),
    input.money,
    settlement,
    input.durableAttemptRef,
    input.durableEffectGeneration,
    outputValidation,
    input.fenced,
  )
  return observation
}

export async function settleBrokeredX402Observation(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    observation: RouteTransportObservation
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
    reservation: BrokeredChargeReservation
    outputValidation: ContractOutputValidation
  }>,
): Promise<ChargeSettlementResult> {
  const recorded = await recordX402TransportObservation(ctx, input)
  const invalidEvidenceMaterial = {
    format: 'brokered-x402-provider-output-invalid:v1',
    invocationRef: input.dispatch.invocationRef,
    attemptRef: input.durableAttemptRef,
    operationRef: input.dispatch.operationRef,
    observationDigest: recorded.evidenceRefs.at(-1),
  } as StableHashValue
  const invalidEvidenceDigest = canonicalDigest(invalidEvidenceMaterial)
  const invalidEvidenceRef = `provider-output-invalid:${invalidEvidenceDigest}`
  const accountingTransactionRefs = input.reservation.charge.transactionRef === undefined
    ? undefined
    : [input.reservation.charge.transactionRef]
  const markUnknown = async (): Promise<ChargeSettlementResult> => {
    await markBrokeredInvocationChargeOutcomeUnknown(ctx, input.reservation)
    return {
      kind: 'reconciliation_required',
      ...(recorded.identity === undefined ? {} : { paymentIdentifier: recorded.identity.paymentIdentifier }),
      ...(accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs }),
      refundState: 'unknown',
      lossState: 'unknown',
    }
  }
  if (recorded.identity === undefined) {
    return input.observation.paymentSubmissionStatus === 'possibly_submitted'
      || input.observation.paymentSubmissionStatus === 'unknown'
      ? await markUnknown()
      : await releaseBrokeredInvocationCharge(ctx, input.reservation).then((released) => released.kind === 'settled'
        ? {
            ...released,
            ...(accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs }),
            refundState: 'released' as const,
            lossState: 'none' as const,
          }
        : released)
  }
  const identity = recorded.identity
  if (recorded.settlementStatus === 'unknown') {
    await finalizeX402ExternalSpend(
      ctx,
      identity,
      recorded.submissionStatus,
      'unknown',
      recorded.settlementDigest,
      recorded.evidenceRefs,
      recorded.providerReceiptDigest,
    )
    return await markUnknown()
  }
  if (recorded.settlementStatus === 'settled' && !input.outputValidation.valid) {
    const reversed = await reverseX402ExternalSpendForInvalidOutput(
      ctx,
      identity,
      {
        settlementStatus: recorded.settlementStatus,
        submissionStatus: recorded.submissionStatus,
        ...(recorded.settlementDigest === undefined
          ? {}
          : { paymentResponseDigest: recorded.settlementDigest }),
        ...(recorded.providerReceiptDigest === undefined
          ? {}
          : { providerReceiptDigest: recorded.providerReceiptDigest }),
        evidenceRefs: recorded.evidenceRefs,
        invalidOutputEvidenceRef: invalidEvidenceRef,
        invalidOutputEvidenceDigest: invalidEvidenceDigest,
      },
    )
    if (reversed.kind !== 'settled' || recorded.settlementRef === undefined) return await markUnknown()
    const loss = await recordBrokeredInvalidOutputLoss(ctx, input.reservation, {
      externalRef: recorded.settlementRef,
      invalidOutputEvidenceRef: invalidEvidenceRef,
      invalidOutputEvidenceDigest: invalidEvidenceDigest,
      reconciliationEvidenceRefs: recorded.evidenceRefs,
    })
    if (loss.kind !== 'settled') return await markUnknown()
    return {
      kind: 'settled',
      outcome: 'not_released',
      externalSettlementRef: recorded.settlementRef,
      settlementTransactionHash: recorded.settlementRef,
      paymentIdentifier: identity.paymentIdentifier,
      accountingTransactionRefs: accountingTransactionRefs === undefined
        ? [loss.lossTransactionRef]
        : [...accountingTransactionRefs, loss.lossTransactionRef],
      refundState: 'released' as const,
      lossState: 'provider_output_invalid' as const,
    }
  }
  if (recorded.settlementStatus === 'settled') {
    const external = await finalizeX402ExternalSpend(
      ctx,
      identity,
      recorded.submissionStatus,
      'settled',
      recorded.settlementDigest,
      recorded.evidenceRefs,
      recorded.providerReceiptDigest,
    )
    return external.kind === 'settled' && recorded.settlementRef !== undefined
      ? await finalizeBrokeredInvocationCharge(
          ctx,
          input.reservation,
          recorded.settlementRef,
          recorded.evidenceRefs,
        ).then((finalized) => finalized.kind === 'settled' && recorded.settlementRef !== undefined
          ? {
              ...finalized,
              externalSettlementRef: recorded.settlementRef,
              settlementTransactionHash: recorded.settlementRef,
              paymentIdentifier: identity.paymentIdentifier,
              ...(accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs }),
              refundState: 'not_applicable' as const,
              lossState: 'none' as const,
            }
          : finalized)
      : await markUnknown()
  }
  const external = await finalizeX402ExternalSpend(
    ctx,
    identity,
    recorded.submissionStatus,
    'not_settled',
    recorded.settlementDigest,
    recorded.evidenceRefs,
    recorded.providerReceiptDigest,
  )
  return external.kind === 'settled'
    ? await releaseBrokeredInvocationCharge(ctx, input.reservation, recorded.evidenceRefs).then((released) => released.kind === 'settled'
      ? {
          ...released,
          ...(recorded.settlementRef === undefined ? {} : {
            externalSettlementRef: recorded.settlementRef,
            settlementTransactionHash: recorded.settlementRef,
          }),
          paymentIdentifier: identity.paymentIdentifier,
          ...(accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs }),
          refundState: 'released' as const,
          lossState: 'none' as const,
        }
      : released)
    : await markUnknown()
}

export async function projectBrokeredX402OuterResult(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  observation: RouteTransportObservation,
  recordedAt: string,
  money: WorkerAcceptedCharge | undefined,
  settlement: ChargeSettlementResult,
  attemptRef: string,
  effectGeneration: number,
  outputValidation: ContractOutputValidation,
  retainedSnapshot: CanonicalClaimSnapshot,
): Promise<void> {
  const receiptEvidenceHash = observation.responseDigest ?? canonicalDigest(JSON.stringify(observation))
  const receipt = (state: OperationInvokeReceipt['state']): OperationInvokeReceipt | undefined => buildBrokeredX402Receipt({
    operation,
    invocationRef: dispatch.invocationRef,
    operationRef: dispatch.operationRef,
    state,
    evidenceHash: receiptEvidenceHash,
    issuedAt: recordedAt,
    ...(money?.transactionRef === undefined ? {} : { transactionRef: money.transactionRef }),
    ...(settlement.kind === 'settled' && settlement.settlementTransactionHash !== undefined
      ? { settlementTransactionHash: settlement.settlementTransactionHash }
      : {}),
    ...(settlement.paymentIdentifier === undefined ? {} : { paymentIdentifier: settlement.paymentIdentifier }),
    ...(settlement.accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs: settlement.accountingTransactionRefs }),
    ...(settlement.refundState === undefined ? {} : { refundState: settlement.refundState }),
    ...(settlement.lossState === undefined ? {} : { lossState: settlement.lossState }),
    ...(settlement.kind === 'settled' && settlement.externalSettlementRef !== undefined
      ? { externalSettlementRef: settlement.externalSettlementRef }
      : {}),
  })
  const settlementOutcome = settlement.kind === 'settled'
    ? settlement.outcome
    : settlement.kind === 'reconciliation_required'
      ? 'unknown'
      : undefined
  const requiresReconciliation = (
    settlement.kind === 'reconciliation_required'
    || observation.disposition === 'unknown'
    || observation.disposition === 'partial'
    || (outputValidation.valid && observation.releaseStarted && settlementOutcome !== 'released')
    || (outputValidation.valid && observation.outputJson === undefined)
    || (observation.releaseStarted && !outputValidation.valid && settlementOutcome !== 'not_released')
  )
  if (requiresReconciliation) {
    const reconciliationReceipt = receipt('reconciliation_required')
    await finalizeOperationDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome(observation, recordedAt, outputValidation.valid, settlementOutcome),
      {
        state: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${dispatch.operationRef}`,
          },
          ...(reconciliationReceipt === undefined ? {} : { receipt: reconciliationReceipt }),
        },
        attemptRef,
        dispatchState: 'reconciliation_required',
      },
      recordedAt,
    )
    return
  }
  if (
    outputValidation.valid
    && observation.outputJson !== undefined
    && settlement.kind === 'settled'
    && settlement.outcome === 'released'
    && observation.releaseStarted
    && money !== undefined
  ) {
    const evidenceHash = observation.responseDigest ?? canonicalDigest(observation.outputJson)
    const settledReceipt = receipt('settled')
    const usage = {
      usageRef: money.usageRef,
      observedAt: money.observedAt,
      chargeState: money.chargeState,
      amount: money.amount,
      priceDigest: money.priceDigest,
      ...(money.transactionRef === undefined ? {} : { transactionRef: money.transactionRef }),
    }
    await finalizeOperationDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, settlementOutcome),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          invocationRef: dispatch.invocationRef,
          operationRef: dispatch.operationRef,
          output: outputValidation.output,
          evidenceHash,
          usage,
          ...(settledReceipt === undefined ? {} : { receipt: settledReceipt }),
        },
        usage,
        evidenceHash,
        attemptRef,
        dispatchState: 'completed',
      },
      recordedAt,
    )
    return
  }
  const refundedReceipt = receipt('refunded')
  await finalizeOperationDispatch(
    ctx,
    dispatch,
    retainedSnapshot,
    canonicalTerminalOutcome(observation, recordedAt, outputValidation.valid, settlementOutcome),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        operationRef: dispatch.operationRef,
        code: outputValidation.valid || observation.outputJson === undefined
          ? observation.failureCode ?? 'provider_refused'
          : 'provider_output_invalid',
        retryable: false,
        ...(refundedReceipt === undefined ? {} : { receipt: refundedReceipt }),
      },
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown'
}
