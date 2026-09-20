import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'

import {
  fundingCommandView,
  fundingResultValue,
  refused,
  type FundingResult,
} from './accountFundingValidators'

export const readWebhookCommandForWorkerArgs = {
  commandRef: v.string(),
  externalRef: v.string(),
}
export const readWebhookCommandForWorkerResult = fundingResultValue

export async function readWebhookCommandForWorkerHandler(
  ctx: QueryCtx,
  args: { commandRef: string; externalRef: string },
): Promise<FundingResult> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  return command === null
    || (command.externalRef !== undefined && command.externalRef !== args.externalRef)
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}

export const readWebhookRefundCommandForWorkerArgs = {
  paymentId: v.string(),
}
export const readWebhookRefundCommandForWorkerResult = fundingResultValue

export async function readWebhookRefundCommandForWorkerHandler(
  ctx: QueryCtx,
  args: { paymentId: string },
): Promise<FundingResult> {
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_paymentId', (builder) => builder.eq('paymentId', args.paymentId))
    .unique()
  return command === null
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}
