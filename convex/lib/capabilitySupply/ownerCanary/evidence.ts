import type { QueryCtx } from '../../../_generated/server'

export async function readSellerOnboardingCanaryEvidenceHandler(
  ctx: QueryCtx,
  args: { canaryRef: string },
) {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .unique()
  if (
    row === null
    || row.sellerOnboardingCanary === undefined
    || row.toolJson === undefined
    || row.sellerOnboardingCanary.canaryRef !== args.canaryRef
    || row.sellerOnboardingCanary.callRef !== row.callRef
    || row.sellerOnboardingCanary.toolRef !== row.toolRef
    || row.sellerOnboardingCanary.inputDigest !== row.inputDigest
    || row.sellerOnboardingCanary.idempotencyKey !== row.idempotencyKey
  ) return null
  return {
    sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary),
    toolJson: row.toolJson,
    state: row.state,
    ...(row.result === undefined ? {} : { result: structuredClone(row.result) }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    updatedAt: row.updatedAt,
  }
}
