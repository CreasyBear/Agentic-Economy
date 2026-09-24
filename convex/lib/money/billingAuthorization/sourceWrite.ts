import type { MutationCtx } from '../../../_generated/server'
import { requireSourceWrite } from '../../../sourceWriteAdmission'

export type BillingSourceWriteArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

export async function requireBillingSourceWrite(
  ctx: MutationCtx,
  args: BillingSourceWriteArgs,
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'billing')
  if (result.kind === 'rejected') {
    throw new Error(`money_billing_source_write_rejected:${result.reason}`)
  }
}
