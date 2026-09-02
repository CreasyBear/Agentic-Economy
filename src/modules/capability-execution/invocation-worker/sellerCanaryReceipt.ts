import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import { operationInvokeReceiptPaymentProfile } from '@/modules/capability-execution/operation-invoke-contracts'
import type {
  PublishedOperation,
  SellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import type { ExactAmount } from '@/modules/money/public'

/**
 * Seller canaries spend AE-owned testnet funds but never create buyer usage,
 * provider earnings, or platform rake. This builder is shared by initial
 * execution and recovery so evidence survives without inventing accounting.
 */
export function buildSellerOnboardingCanaryReceipt(input: Readonly<{
  canary: SellerOnboardingCanaryExecutionEnvelope
  operation: PublishedOperation
  invocationRef: string
  operationRef: string
  attemptRef: string
  state: OperationInvokeReceipt['state']
  providerQuotedAmount: ExactAmount
  evidenceHash: string
  issuedAt: string
  paymentIdentifier?: string
  settlementTransactionHash?: string
  externalSettlementRef?: string
  refundState: NonNullable<OperationInvokeReceipt['refundState']>
  lossState: NonNullable<OperationInvokeReceipt['lossState']>
}>): OperationInvokeReceipt | undefined {
  const payment = input.operation.identity.payment
  const profile = payment.kind === 'x402'
    ? operationInvokeReceiptPaymentProfile(
        input.operation.runtimeEnvironment,
        payment.network,
        payment.asset,
      )
    : undefined
  if (
    input.canary.executionPurpose !== 'seller_onboarding_canary'
    || input.operation.runtimeEnvironment !== 'sandbox'
    || profile?.network !== 'eip155:84532'
    || input.canary.invocationRef !== input.invocationRef
    || input.canary.operationRef !== input.operationRef
    || input.canary.priceDigest !== input.operation.priceDigest
    || input.evidenceHash.trim().length === 0
    || input.issuedAt.trim().length === 0
  ) return undefined
  const zero = {
    currency: input.providerQuotedAmount.currency,
    units: '0',
    exponent: input.providerQuotedAmount.exponent,
  }
  return {
    commercialModel: 'seller_canary_x402',
    receiptRef: `seller-canary-receipt:${input.canary.canaryRef}:${input.attemptRef}`,
    state: input.state,
    providerQuotedAmount: input.providerQuotedAmount,
    agenticEconomyFee: zero,
    totalBuyerAuthorization: zero,
    priceDigest: input.canary.priceDigest,
    ...profile,
    ...(input.paymentIdentifier === undefined
      ? {}
      : { paymentIdentifier: input.paymentIdentifier }),
    ...(input.settlementTransactionHash === undefined
      ? {}
      : { settlementTransactionHash: input.settlementTransactionHash }),
    ...(input.externalSettlementRef === undefined
      ? {}
      : { externalSettlementRef: input.externalSettlementRef }),
    refundState: input.refundState,
    lossState: input.lossState,
    evidenceHash: input.evidenceHash,
    issuedAt: input.issuedAt,
  }
}
