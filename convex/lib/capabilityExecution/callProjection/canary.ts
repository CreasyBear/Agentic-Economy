import type { ActionCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { transportObservationDigest, type PublishedTool, type RuntimePublishedToolDescriptor } from '@/modules/capability-supply/public'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import { pricingConfigDecisionAmount } from '@/modules/money/public'
import { buildSellerOnboardingCanaryReceipt, type CanonicalClaimSnapshot } from '@/modules/capability-execution/convex'
import { callReceiptPaymentProfile } from '@/modules/capability-execution/call-contracts'
import type { OpenDispatch, ChargeSettlementResult, ContractOutputValidation } from '@/modules/capability-execution/convex'
import { canonicalTerminalOutcome } from '@/modules/capability-execution/convex'
import { finalizeCallDispatch } from './dispatch'

/**
 * Finalize the platform-funded seller-onboarding canary without inventing
 * buyer usage or Provider earnings. The canary receipt preserves its exact
 * payment evidence for promotion and audit.
 */
export async function projectSellerOnboardingCanaryResult(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedTool,
  descriptor: RuntimePublishedToolDescriptor,
  observation: RouteTransportObservation,
  recordedAt: string,
  settlement: ChargeSettlementResult,
  attemptRef: string,
  effectGeneration: number,
  validatedOutput: ContractOutputValidation,
  retainedSnapshot: CanonicalClaimSnapshot,
): Promise<void> {
  const canary = dispatch.sellerOnboardingCanary
  const payment = operation.identity.payment
  const profile = payment.kind === 'x402'
    ? callReceiptPaymentProfile(
        dispatch.environment,
        payment.network,
        payment.asset,
      )
    : undefined
  if (
    canary === undefined
    || profile === undefined
    || pricingConfigDecisionAmount(operation.pricingConfig) !== undefined
  ) throw new Error('seller_canary_projection_identity_invalid')

  const evidenceHash = observation.responseDigest
    ?? (observation.outputJson === undefined
      ? transportObservationDigest(observation)
      : canonicalDigest(observation.outputJson))
  const settled = settlement.kind === 'settled' ? settlement : undefined
  const knownSettled = settled?.outcome === 'released'
    && settled.externalSettlementRef !== undefined
    && settled.settlementTransactionHash !== undefined
    && settled.paymentIdentifier !== undefined
  const knownNotSettled = settled?.outcome === 'not_released'
    && observation.releaseStarted === false
  const receipt = buildSellerOnboardingCanaryReceipt({
    canary,
    operation,
    callRef: dispatch.callRef,
    toolRef: dispatch.toolRef,
    attemptRef,
    state: knownSettled
      ? 'settled'
      : knownNotSettled
        ? 'refunded'
        : 'reconciliation_required',
    providerQuotedAmount: canary.funding.requestedSpend,
    ...(settlement.paymentIdentifier === undefined
      ? {}
      : { paymentIdentifier: settlement.paymentIdentifier }),
    ...(settled?.settlementTransactionHash === undefined
      ? {}
      : { settlementTransactionHash: settled.settlementTransactionHash }),
    ...(settled?.externalSettlementRef === undefined
      ? {}
      : { externalSettlementRef: settled.externalSettlementRef }),
    refundState: knownSettled ? 'not_applicable' : knownNotSettled ? 'released' : 'unknown',
    lossState: knownSettled
      ? validatedOutput.valid ? 'none' : 'provider_output_invalid'
      : knownNotSettled ? 'none' : 'unknown',
    evidenceHash,
    issuedAt: recordedAt,
  })
  if (receipt === undefined) throw new Error('seller_canary_receipt_identity_invalid')
  const successful = knownSettled
    && validatedOutput.valid
    && observation.disposition === 'succeeded'
    && observation.outputJson !== undefined
    && observation.releaseStarted
  if (successful) {
    await finalizeCallDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome(observation, recordedAt, true, 'released'),
      {
        state: 'completed',
        result: {
          kind: 'completed',
          callRef: dispatch.callRef,
          toolRef: dispatch.toolRef,
          output: validatedOutput.output,
          evidenceHash,
          receipt,
        },
        evidenceHash,
        attemptRef,
        dispatchState: 'completed',
      },
      recordedAt,
    )
    return
  }

  const ambiguous = settlement.kind === 'reconciliation_required'
    || (!knownSettled && !knownNotSettled)
    || observation.disposition === 'unknown'
    || observation.disposition === 'partial'
  if (ambiguous) {
    await finalizeCallDispatch(
      ctx,
      dispatch,
      retainedSnapshot,
      canonicalTerminalOutcome({
        ...observation,
        disposition: 'unknown',
        releaseStarted: true,
      }, recordedAt, validatedOutput.valid, 'unknown'),
      {
        state: 'reconciliation_required',
        result: {
          kind: 'reconciliation_required',
          callRef: dispatch.callRef,
          toolRef: dispatch.toolRef,
          evidence: {
            attemptRef,
            effectGeneration,
            requiredAt: new Date(Date.parse(recordedAt) + 1_000).toISOString(),
            retry: 'reconcile_before_retry',
            evidenceSource: `seller-canary:${canary.canaryRef}`,
          },
          receipt,
        },
        evidenceHash,
        attemptRef,
        dispatchState: 'reconciliation_required',
      },
      recordedAt,
    )
    return
  }

  const paidButInvalid = knownSettled && !validatedOutput.valid
  await finalizeCallDispatch(
    ctx,
    dispatch,
    retainedSnapshot,
    paidButInvalid
      ? {
          kind: 'returned',
          businessOutcome: 'seller_onboarding_canary_output_invalid',
          resultRef: `seller-canary-result:v1:${evidenceHash}`,
          resultDigest: evidenceHash,
          resultReferenceable: true,
          release: 'released',
        }
      : canonicalTerminalOutcome(observation, recordedAt, false, 'not_released'),
    {
      state: 'refused',
      result: {
        kind: 'refused',
        toolRef: dispatch.toolRef,
        code: paidButInvalid
          ? 'seller_canary_output_invalid'
          : observation.failureCode ?? 'provider_refused',
        retryable: false,
        receipt,
      },
      evidenceHash,
      attemptRef,
      dispatchState: 'failed',
    },
    recordedAt,
  )
}
