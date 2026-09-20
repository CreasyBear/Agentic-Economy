import type { Infer } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'
import { requireSourceWrite } from '../../sourceWriteAdmission'
import {
  prepareFundingRefundEvent,
  prepareFundingSettlementEvent,
} from './fundingStripeEventPipeline'

import {
  applyFundingEventArgsValue,
  prepareFundingEventResultValue,
  refused,
  trustedApplyFundingEventArgsValue,
  type ApplyFundingEventArgs,
} from './accountFundingValidators'

export const prepareVerifiedEventArgs = applyFundingEventArgsValue
export const prepareVerifiedEventResult = prepareFundingEventResultValue
export const prepareVerifiedEventFromInboxArgs = trustedApplyFundingEventArgsValue
export const prepareVerifiedEventFromInboxResult = prepareFundingEventResultValue

export async function prepareVerifiedEventHandler(
  ctx: MutationCtx,
  args: ApplyFundingEventArgs,
): Promise<Infer<typeof prepareFundingEventResultValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  if (args.event.kind === 'checkout') return await prepareFundingSettlementEvent(ctx, args)
  if (args.event.kind === 'refund') return await prepareFundingRefundEvent(ctx, args)
  return refused('payment_binding_invalid')
}

export async function prepareVerifiedEventFromInboxHandler(
  ctx: MutationCtx,
  args: Infer<typeof trustedApplyFundingEventArgsValue>,
): Promise<Infer<typeof prepareFundingEventResultValue>> {
  if (args.event.kind === 'checkout') return await prepareFundingSettlementEvent(ctx, args)
  if (args.event.kind === 'refund') return await prepareFundingRefundEvent(ctx, args)
  return refused('payment_binding_invalid')
}
