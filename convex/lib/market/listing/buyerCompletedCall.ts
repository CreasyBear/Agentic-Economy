import type { MutationCtx } from '../../../_generated/server'

export async function assertBuyerCompletedCall(
  ctx: MutationCtx,
  principalId: string,
  toolRef: string,
): Promise<void> {
  const completedCall = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_toolRef_and_state', index => index
      .eq('principalId', principalId)
      .eq('toolRef', toolRef)
      .eq('state', 'completed'))
    .take(8)
  if (!completedCall.some(row => row.sellerOnboardingCanary === undefined)) {
    throw new Error('market_rating_completed_call_required')
  }
}
