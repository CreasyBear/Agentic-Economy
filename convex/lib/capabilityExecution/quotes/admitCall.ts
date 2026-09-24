import { v, type Infer } from 'convex/values'

import { principalValue } from '../callLifecycle/contracts'
import { requireSourceWrite, sourceWriteArgs } from '../../../sourceWriteAdmission'
import type { MutationCtx } from '../../../_generated/server'

export const admitCallArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
  quoteRef: v.string(),
  idempotencyKey: v.string(),
}

export const admitCallResult = v.boolean()

type AdmitCallArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
  principal: Infer<typeof principalValue>
  quoteRef: string
  idempotencyKey: string
}

export async function admitCallHandler(
  ctx: MutationCtx,
  args: AdmitCallArgs,
): Promise<boolean> {
  return (await requireSourceWrite(ctx, args, 'protected_action')).kind === 'accepted'
}
