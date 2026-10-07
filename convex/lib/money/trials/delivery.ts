import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { trialOfferHasAuthority } from './authority'

export const offerRefArgs = { offerRef: v.string() }
export const deliveryWorkValue = v.union(v.null(), v.object({
  kind: v.union(v.literal('send'), v.literal('reconcile')), email: v.string(),
  attemptRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')),
}))
export const deliveryOutcomeValue = v.union(
  v.object({ kind: v.literal('sent'), invitationRef: v.string() }),
  v.object({ kind: v.literal('failed'), code: v.string() }),
  v.object({ kind: v.literal('unknown') }),
)
export const finishDeliveryArgs = { ...offerRefArgs, attemptRef: v.string(), outcome: deliveryOutcomeValue }

/** Requires original approval. Ensures only the queued -> sending transaction can
 * authorize email creation. Concurrent/retried work only reads Clerk. On unknown
 * outcome keep the attempt identity; no new send is inferred from an absent read. */
export async function claimDeliveryHandler(ctx: MutationCtx, args: { offerRef: string }): Promise<Infer<typeof deliveryWorkValue>> {
  const offer = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', args.offerRef)).unique()
  if (offer === null || offer.recipient.kind !== 'email' || !await trialOfferHasAuthority(ctx, offer)) return null
  const delivery = offer.delivery
  if (delivery.kind === 'sent' || delivery.kind === 'failed' || delivery.kind === 'not_required') return null
  const now = Date.now()
  if (offer.activation.kind === 'unclaimed' && offer.activation.claimBy <= now) return null
  if (delivery.kind !== 'queued') return {
    kind: 'reconcile', email: offer.recipient.email, environment: offer.environment, attemptRef: delivery.attemptRef,
  }
  const attemptRef = canonicalDigest({ format: 'ae.trial-invitation-send:v1', offerRef: offer.offerRef })
  await ctx.db.patch(offer._id, { delivery: { kind: 'sending', attemptRef, startedAt: now }, updatedAt: now })
  await ctx.scheduler.runAfter(30_000, internal.trialAccessActions.deliverInvitation, { offerRef: offer.offerRef })
  return { kind: 'send', email: offer.recipient.email, environment: offer.environment, attemptRef }
}

export async function finishDeliveryHandler(ctx: MutationCtx, args: {
  offerRef: string; attemptRef: string; outcome: Infer<typeof deliveryOutcomeValue>
}): Promise<boolean> {
  const offer = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', args.offerRef)).unique()
  if (offer === null || !await trialOfferHasAuthority(ctx, offer)) return false
  if (offer.delivery.kind === 'sent') return args.outcome.kind === 'sent' && offer.delivery.invitationRef === args.outcome.invitationRef
  if ((offer.delivery.kind !== 'sending' && offer.delivery.kind !== 'unknown') || offer.delivery.attemptRef !== args.attemptRef) return false
  await ctx.db.patch(offer._id, { delivery: args.outcome.kind === 'unknown'
    ? { kind: 'unknown', attemptRef: args.attemptRef } : args.outcome, updatedAt: Date.now() })
  return true
}
