import type { CallReceipt, CallUsageSummary } from '@/modules/capability-execution/call-contracts'
import type { ExactAmount } from '@/modules/money/public'

export { machineLabel } from '@/lib/call-recovery/machine-label'

export function settledPaidBuyerCharge(
  receipt: CallReceipt | undefined,
  usage: CallUsageSummary | undefined,
): ExactAmount | undefined {
  if (
    receipt?.commercialModel === 'account_aud'
    && receipt.state === 'settled'
    && usage?.chargeState === 'paid'
  ) return receipt.totalBuyerCharge
  return undefined
}
