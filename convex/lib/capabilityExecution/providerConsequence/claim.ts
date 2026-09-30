import { v, type Validator } from 'convex/values'
import { parseRouteTransportObservationJson, type RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import type { MutationCtx } from '../../../_generated/server'

export const claimProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  effectRef: v.string(),
  requestDigest: v.string(),
  invocationDigest: v.string(),
  ticketClaimsDigest: v.string(),
  expiresAt: v.number(),
} as const

const settlementResponseValue = v.object({
  success: v.boolean(),
  transaction: v.string(),
  network: v.string(),
  amount: v.optional(v.string()),
  payer: v.optional(v.string()),
  errorReason: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
})

const routeTransportObservationValue: Validator<RouteTransportObservation, 'required', string> = v.object({
  transport: v.union(v.literal('http'), v.literal('mcp'), v.literal('x402'), v.literal('unknown')),
  disposition: v.union(
    v.literal('succeeded'),
    v.literal('refused'),
    v.literal('partial'),
    v.literal('unknown'),
  ),
  releaseStarted: v.boolean(),
  queryReleaseStatus: v.optional(v.union(
    v.literal('not_released'),
    v.literal('released'),
    v.literal('unknown'),
  )),
  paymentAuthorizationStatus: v.optional(v.union(
    v.literal('not_created'),
    v.literal('created'),
    v.literal('unknown'),
  )),
  paymentSubmissionStatus: v.optional(v.union(
    v.literal('not_submitted'),
    v.literal('possibly_submitted'),
    v.literal('observed'),
    v.literal('unknown'),
  )),
  settlementEvidence: v.optional(v.union(
    v.object({ kind: v.literal('not_submitted') }),
    v.object({
      kind: v.union(v.literal('settled'), v.literal('not_settled')),
      response: settlementResponseValue,
      digest: v.string(),
    }),
    v.object({
      kind: v.literal('unknown'),
      reason: v.string(),
      response: v.optional(settlementResponseValue),
      digest: v.optional(v.string()),
    }),
  )),
  quoteDeliveryStatus: v.optional(v.union(
    v.literal('not_delivered'),
    v.literal('delivered'),
    v.literal('unknown'),
  )),
  requestDigest: v.string(),
  responseStatus: v.optional(v.number()),
  responseDigest: v.optional(v.string()),
  outputJson: v.optional(v.string()),
  providerReceipt: v.optional(v.string()),
  providerOfferDigest: v.optional(v.string()),
  paymentProof: v.optional(v.string()),
  paymentChallengeDigest: v.optional(v.string()),
  continuationToken: v.optional(v.string()),
  failureCode: v.optional(v.string()),
})

export const claimProviderConsequenceResult = v.union(
  v.object({ kind: v.literal('claimed'), claimRef: v.string() }),
  v.object({ kind: v.literal('completed'), observation: routeTransportObservationValue }),
  v.object({ kind: v.literal('started') }),
  v.object({ kind: v.literal('unavailable') }),
)

type ClaimArgs = {
  ticketRef: string
  journalTokenDigest: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  ticketClaimsDigest: string
  expiresAt: number
}

export async function claimProviderConsequenceHandler(ctx: MutationCtx, args: ClaimArgs) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null) return { kind: 'unavailable' as const }
  if (row.journalTokenDigest !== args.journalTokenDigest
    || row.effectRef !== args.effectRef
    || row.requestDigest !== args.requestDigest
    || row.invocationDigest !== args.invocationDigest
    || row.ticketClaimsDigest !== args.ticketClaimsDigest
    || row.expiresAt !== args.expiresAt) return { kind: 'unavailable' as const }
  if (row.state === 'completed') {
    if (row.observationJson === undefined) return { kind: 'unavailable' as const }
    const observation = parseRouteTransportObservationJson(row.observationJson)
    return observation === undefined
      ? { kind: 'unavailable' as const }
      : { kind: 'completed' as const, observation }
  }
  if (row.state === 'started') return { kind: 'started' as const }
  if (row.state === 'aborted') return { kind: 'unavailable' as const }
  const now = Date.now()
  if (row.expiresAt <= now) {
    await ctx.db.patch(row._id, { state: 'aborted', abortedAt: now, updatedAt: now })
    return { kind: 'unavailable' as const }
  }
  const claimRef = `provider-claim:${row.ticketRef}`
  await ctx.db.patch(row._id, { state: 'started', claimRef, startedAt: now, updatedAt: now })
  return { kind: 'claimed' as const, claimRef }
}
