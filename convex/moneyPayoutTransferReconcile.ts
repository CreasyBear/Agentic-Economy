import type { MutationCtx } from './_generated/server'
import { requireBillingSourceWrite } from './moneyBillingAuthorization'
import {
  completePayoutBody,
  type CompletePayoutTransferArgs,
} from './moneyPayoutTransferCompleteApply'
import type { PayoutTransferResult } from './moneyPayoutTransferShared'
import { payoutOwnedByCurrentOwner } from './moneyPayoutTransferShared'

function refusedPayout(code: string, retryable: boolean): PayoutTransferResult {
  return { kind: 'refused', code, retryable }
}

export type ReconcilePayoutTransferArgs = CompletePayoutTransferArgs & {
  outcome: 'not_released' | 'failed'
}

export async function reconcilePayoutTransferHandler(
  ctx: MutationCtx,
  args: ReconcilePayoutTransferArgs,
): Promise<PayoutTransferResult> {
    await requireBillingSourceWrite(ctx, args)
    if (!(await payoutOwnedByCurrentOwner(ctx, args.businessId)))
      return refusedPayout('billing_identity_missing', false)
    switch (args.outcome) {
      case 'not_released':
      case 'failed':
        return await completePayoutBody(ctx, args)
      default: {
        const _exhaustive: never = args.outcome
        return refusedPayout('payout_reconciliation_required', false)
      }
    }
}
