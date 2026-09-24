import type { Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'

import {
  fundingCommandView,
  fundingResultValue,
  markFundingUnknownArgsValue,
  refused,
  type FundingResult,
} from './contracts'

export const markOutcomeUnknownArgs = markFundingUnknownArgsValue
export const markOutcomeUnknownResult = fundingResultValue

export async function markOutcomeUnknownHandler(
  ctx: MutationCtx,
  args: Infer<typeof markFundingUnknownArgsValue>,
): Promise<FundingResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return refused('source_write_denied')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command === null
    || command.accountRef !== actor.canonicalAccountRef
    || command.idempotencyKey !== args.idempotencyKey) return refused('funding_pending', true)
  if (command.state === 'failed') return refused('funding_idempotency_conflict')
  if (command.state === 'pending') {
    await ctx.db.patch(command._id, {
      state: 'outcome_unknown',
      providerStatus: 'outcome_unknown',
      updatedAt: Date.now(),
    })
  }
  const updated = await ctx.db.get(command._id)
  return updated === null ? refused('funding_outcome_unknown', true) : { kind: 'accepted', command: fundingCommandView(updated) }
}
