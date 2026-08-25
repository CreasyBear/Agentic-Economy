import type { MutationCtx } from './_generated/server'
import { requireBillingSourceWrite } from './moneyBillingAuthorization'
import {
  completePayoutBody,
  type CompletePayoutTransferArgs,
} from './moneyPayoutTransferCompleteApply'
import type { PayoutTransferResult } from './moneyPayoutTransferShared'

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
