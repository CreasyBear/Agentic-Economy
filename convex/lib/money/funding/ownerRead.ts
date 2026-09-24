import type { Infer } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

import {
  fundingCommandView,
  fundingResultValue,
  readFundingArgsValue,
  refused,
  type FundingResult,
} from './contracts'

export const readArgs = readFundingArgsValue
export const readResult = fundingResultValue

export async function readHandler(
  ctx: QueryCtx,
  args: Infer<typeof readFundingArgsValue>,
): Promise<FundingResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  if ((args.commandRef === undefined) === (args.externalRef === undefined)) {
    return refused('payment_binding_invalid')
  }
  let command
  if (args.commandRef !== undefined) {
    const commandRef = args.commandRef
    command = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_commandRef', (builder) => builder.eq('commandRef', commandRef))
      .unique()
  } else if (args.externalRef !== undefined) {
    const externalRef = args.externalRef
    command = await ctx.db.query('moneyFundingCommands')
      .withIndex('by_externalRef', (builder) => builder.eq('externalRef', externalRef))
      .unique()
  } else {
    return refused('payment_binding_invalid')
  }
  return command === null
    || command.accountRef !== actor.canonicalAccountRef
    || (args.commandRef !== undefined && command.idempotencyKey !== args.idempotencyKey)
    ? refused('funding_pending', true)
    : { kind: 'accepted', command: fundingCommandView(command) }
}
