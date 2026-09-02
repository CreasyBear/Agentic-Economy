import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  invokePreparedRouteTransport,
  type RouteTransportObservation,
  type RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation, RuntimePublishedOperationDescriptor } from '@/modules/capability-supply/public'
import {
  normalizePricingConfig,
  pricingConfigDigest,
  pricingConfigSourceAmount,
  type ExactAmount,
} from '@/modules/money/public'
import {
  operationInvokeReceiptPaymentProfile,
  type OperationInvokeReceipt,
} from '@/modules/capability-execution/operation-invoke-contracts'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { CanonicalClaimSnapshot } from '@/modules/action-invocation/runtime'
import {
  canonicalTerminalOutcome,
  finalizeOperationDispatch,
  type OpenDispatch,
  parseContractOutput,
} from '../../../../convex/capabilityOperationInvocationProjection'
import { recordX402TransportObservation } from './x402Route'

export function buildBrokeredX402Receipt(input: Readonly<{
  operation: PublishedOperation
  invocationRef: string
  operationRef: string
  state: OperationInvokeReceipt['state']
  buyerCharge: ExactAmount
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
  const paymentProfile = input.operation.identity.payment.kind === 'x402'
    ? operationInvokeReceiptPaymentProfile(
        input.operation.runtimeEnvironment,
        input.operation.identity.payment.network,
        input.operation.identity.payment.asset,
      )
    : undefined
  if (
    identityPricing.kind === 'invalid'
    || operationPricing.kind === 'invalid'
    || identityPricing.config.kind !== 'managed_x402'
    || operationPricing.config.kind !== 'managed_x402'
    || pricingConfigDigest(identityPricing.config) !== input.operation.identity.priceDigest
    || pricingConfigDigest(operationPricing.config) !== input.operation.priceDigest
    || input.operation.identity.priceDigest !== input.operation.priceDigest
    || pricingConfigDigest(identityPricing.config) !== pricingConfigDigest(operationPricing.config)
    || input.operation.identity.payment.kind !== 'x402'
    || paymentProfile === undefined
    || input.evidenceHash.trim().length === 0
    || input.issuedAt.trim().length === 0
  ) return undefined
  const providerQuotedAmount = pricingConfigSourceAmount(identityPricing.config)
  if (input.buyerCharge.currency !== 'AUD' || input.buyerCharge.exponent !== 6) return undefined
  const serviceFee = { currency: 'AUD' as const, units: '0', exponent: 6 as const }
  const receiptIdentity = {
    format: 'operation-invoke-receipt:v2',
    invocationRef: input.invocationRef,
    operationRef: input.operationRef,
    priceDigest: input.operation.priceDigest,
    buyerCharge: input.buyerCharge,
    serviceFee,
    providerObligation: providerQuotedAmount,
    network: paymentProfile.network,
    asset: paymentProfile.asset,
  } as StableHashValue
  return {
    commercialModel: 'account_aud',
    receiptRef: `receipt:${canonicalDigest(receiptIdentity)}`,
    state: input.state,
    buyerCharge: input.buyerCharge,
    serviceFee,
    totalBuyerCharge: input.buyerCharge,
    providerObligation: {
      amount: providerQuotedAmount,
      settlementMethod: 'managed_x402',
      payoutEligible: false,
    },
    providerSettlement: {
      ...paymentProfile,
      amount: providerQuotedAmount,
      ...(input.settlementTransactionHash === undefined
        ? {}
        : { transactionHash: input.settlementTransactionHash }),
      ...(input.paymentIdentifier === undefined
        ? {}
        : { paymentIdentifier: input.paymentIdentifier }),
    },
    priceDigest: input.operation.priceDigest,
    ...(input.transactionRef === undefined ? {} : { transactionRef: input.transactionRef }),
    ...(input.accountingTransactionRefs === undefined ? {} : { accountingTransactionRefs: [...input.accountingTransactionRefs] }),
    ...(input.refundState === undefined ? {} : { refundState: input.refundState }),
    ...(input.lossState === undefined ? {} : { lossState: input.lossState }),
    ...(input.externalSettlementRef === undefined ? {} : { externalSettlementRef: input.externalSettlementRef }),
    evidenceHash: input.evidenceHash,
    issuedAt: input.issuedAt,
  }
}

export async function runCommittedManagedX402Transport(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    descriptor: RuntimePublishedOperationDescriptor
    prepared: Parameters<typeof invokePreparedRouteTransport>[0]
    runtime: RouteTransportRuntime
    durableAttemptRef: string
    durableEffectGeneration: number
    operationKeyDigest: string
    fenced: CanonicalClaimSnapshot
  }>,
): Promise<RouteTransportObservation> {
  const observation = await invokePreparedRouteTransport(input.prepared, input.runtime)
  const recordedAt = new Date().toISOString()
  const output = parseContractOutput(observation, input.descriptor)
  const reservation = await ctx.runQuery(internal.moneyManagedCallLifecycle.readReservation, {
    invocationRef: input.dispatch.invocationRef,
  })
  if (reservation === null) throw new Error('managed_call_reservation_missing')

  let recorded
  try {
    recorded = await recordX402TransportObservation(ctx, {
      dispatch: input.dispatch,
      operation: input.operation,
      observation,
      durableAttemptRef: input.durableAttemptRef,
      durableEffectGeneration: input.durableEffectGeneration,
      operationKeyDigest: input.operationKeyDigest,
    })
  } catch {
    await retainManagedCallUnknown(ctx, input, observation)
    await projectManagedCall(ctx, input, observation, recordedAt, output, reservation, 'unknown')
    return observation
  }

  if (recorded.settlementStatus === 'settled' && recorded.settlementRef !== undefined) {
    const settled = await ctx.runAction(internal.moneyManagedCallLifecycle.settle, {
      invocationRef: input.dispatch.invocationRef,
      evidenceDigest: recorded.settlementDigest ?? canonicalDigest({
        format: 'ae.managed-x402-settlement:v1',
        invocationRef: input.dispatch.invocationRef,
        settlementRef: recorded.settlementRef,
      }),
      now: Date.parse(recordedAt),
    })
    if (settled.kind !== 'accepted') {
      await retainManagedCallUnknown(ctx, input, observation)
      await projectManagedCall(ctx, input, observation, recordedAt, output, reservation, 'unknown')
      return observation
    }
    await projectManagedCall(
      ctx,
      input,
      observation,
      recordedAt,
      output,
      reservation,
      'settled',
      recorded.settlementRef,
    )
    return observation
  }

  const definitelyPreSubmit = recorded.submissionStatus === 'not_submitted'
    && observation.releaseStarted === false
  if (definitelyPreSubmit) {
    const released = await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
      invocationRef: input.dispatch.invocationRef,
      now: Date.parse(recordedAt),
    })
    if (released.kind === 'accepted') {
      await projectManagedCall(ctx, input, observation, recordedAt, output, reservation, 'released')
      return observation
    }
  }

  await retainManagedCallUnknown(ctx, input, observation)
  await projectManagedCall(ctx, input, observation, recordedAt, output, reservation, 'unknown')
  return observation
}

async function retainManagedCallUnknown(
  ctx: ActionCtx,
  input: Parameters<typeof runCommittedManagedX402Transport>[1],
  observation: RouteTransportObservation,
): Promise<void> {
  await ctx.runMutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
    invocationRef: input.dispatch.invocationRef,
    evidenceDigest: canonicalDigest({
      format: 'ae.managed-x402-unknown:v1',
      invocationRef: input.dispatch.invocationRef,
      attemptRef: input.durableAttemptRef,
      effectGeneration: input.durableEffectGeneration,
      observation: observation.requestDigest,
    }),
    now: Date.now(),
  })
}

async function projectManagedCall(
  ctx: ActionCtx,
  input: Parameters<typeof runCommittedManagedX402Transport>[1],
  observation: RouteTransportObservation,
  recordedAt: string,
  output: ReturnType<typeof parseContractOutput>,
  reservation: NonNullable<Awaited<ReturnType<ActionCtx['runQuery']>>>,
  financialState: 'settled' | 'released' | 'unknown',
  settlementRef?: string,
): Promise<void> {
  const managed = reservation as {
    decisionAudUnits: string
    journalTransactionRef: string
  }
  const evidenceHash = observation.responseDigest
    ?? (observation.outputJson === undefined
      ? canonicalDigest({ requestDigest: observation.requestDigest, disposition: observation.disposition })
      : canonicalDigest(observation.outputJson))
  const receipt = buildBrokeredX402Receipt({
    operation: input.operation,
    invocationRef: input.dispatch.invocationRef,
    operationRef: input.dispatch.operationRef,
    state: financialState === 'settled'
      ? 'settled'
      : financialState === 'released'
        ? 'refunded'
        : 'reconciliation_required',
    buyerCharge: { currency: 'AUD', exponent: 6, units: managed.decisionAudUnits },
    evidenceHash,
    issuedAt: recordedAt,
    transactionRef: managed.journalTransactionRef,
    accountingTransactionRefs: [managed.journalTransactionRef],
    ...(settlementRef === undefined ? {} : {
      settlementTransactionHash: settlementRef,
      externalSettlementRef: settlementRef,
    }),
    refundState: financialState === 'settled'
      ? 'not_applicable'
      : financialState === 'released'
        ? 'released'
        : 'unknown',
    lossState: financialState === 'settled' ? 'none' : financialState === 'released' ? 'none' : 'unknown',
  })
  if (receipt === undefined) throw new Error('managed_call_receipt_invalid')

  if (financialState === 'settled' && output.valid && observation.disposition === 'succeeded') {
    await finalizeOperationDispatch(ctx, input.dispatch, input.fenced,
      canonicalTerminalOutcome(observation, recordedAt, true, 'released'), {
        state: 'completed',
        result: {
          kind: 'completed',
          invocationRef: input.dispatch.invocationRef,
          operationRef: input.dispatch.operationRef,
          output: output.output,
          evidenceHash,
          receipt,
        },
        evidenceHash,
        attemptRef: input.durableAttemptRef,
        dispatchState: 'completed',
      }, recordedAt)
    return
  }

  if (financialState === 'unknown') {
    await finalizeOperationDispatch(ctx, input.dispatch, input.fenced,
      canonicalTerminalOutcome({ ...observation, disposition: 'unknown', releaseStarted: true }, recordedAt, output.valid, 'unknown'), {
        state: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          invocationRef: input.dispatch.invocationRef,
          operationRef: input.dispatch.operationRef,
          evidence: {
            attemptRef: input.durableAttemptRef,
            effectGeneration: input.durableEffectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `operation:${input.dispatch.operationRef}`,
          },
          receipt,
        },
        evidenceHash,
        attemptRef: input.durableAttemptRef,
        dispatchState: 'reconciliation_required',
      }, recordedAt)
    return
  }

  const paidButInvalid = financialState === 'settled' && !output.valid
  await finalizeOperationDispatch(ctx, input.dispatch, input.fenced,
    paidButInvalid
      ? {
          kind: 'returned',
          businessOutcome: 'provider_output_invalid',
          resultRef: `operation-result:v1:${evidenceHash}`,
          resultDigest: evidenceHash,
          resultReferenceable: true,
          release: 'released',
        }
      : canonicalTerminalOutcome(observation, recordedAt, false, 'not_released'), {
      state: 'refused',
      result: {
        kind: 'refused',
        operationRef: input.dispatch.operationRef,
        code: paidButInvalid ? 'provider_output_invalid' : observation.failureCode ?? 'provider_refused',
        retryable: false,
        receipt,
      },
      evidenceHash,
      attemptRef: input.durableAttemptRef,
      dispatchState: 'failed',
    }, recordedAt)
}
