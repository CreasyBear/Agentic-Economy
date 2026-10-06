import type { Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { TRIAL_AMOUNT_UNITS, TRIAL_DURATION_MS, trialClaimResultValue } from '@/modules/money/public'

export type TrialClaimResult = Infer<typeof trialClaimResultValue>

export async function readTrialAccount(ctx: Pick<QueryCtx, 'db'>, accountRef: string): Promise<{ ownerPrincipalRef: string } | null> {
  const account = await ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', accountRef)).unique()
  if (account?.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships').withIndex('by_ownershipRef', q => q.eq('ownershipRef', account.currentOwnershipRef)).unique()
  if (ownership?.lifecycle !== 'active' || ownership.accountRef !== accountRef) return null
  const owner = await ctx.db.query('principals').withIndex('by_principalRef', q => q.eq('principalRef', ownership.ownerPrincipalRef)).unique()
  return owner?.lifecycle === 'active' ? { ownerPrincipalRef: owner.principalRef } : null
}

export async function readAccountTrial(ctx: Pick<QueryCtx, 'db'>, environment: 'sandbox' | 'production', accountRef: string) {
  return await ctx.db.query('moneyTrialOffers').withIndex('by_environment_and_activation_accountRef', q => q
    .eq('environment', environment).eq('activation.accountRef', accountRef)).unique()
}

export async function grantedTrialResult(ctx: Pick<QueryCtx, 'db'>, offer: Doc<'moneyTrialOffers'>): Promise<TrialClaimResult> {
  if (offer.activation.kind !== 'granted') return { kind: 'refused', code: 'trial_not_approved' }
  const activation = offer.activation
  const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', activation.grantRef)).unique()
  if (grant === null || grant.trialOfferRef !== offer.offerRef || grant.accountRef !== activation.accountRef) {
    return { kind: 'refused', code: 'trial_authority_invalid' }
  }
  return { kind: 'granted', grantRef: grant.grantRef, accountRef: activation.accountRef, expiresAt: activation.expiresAt, booking: grant.bookingState }
}

/** Requires admitted Admin intent or a verified claim against original approval.
 * Ensures one Account/environment trial and one pending ledger grant atomically.
 * Invariant: retries keep the grant/expiry; availability starts at zero. A
 * concurrent different offer loses without a second financial effect. */
export async function activateTrialOffer(ctx: MutationCtx, offer: Doc<'moneyTrialOffers'>,
  accountRef: string, ownerPrincipalRef: string, now: number): Promise<TrialClaimResult> {
  if (offer.activation.kind === 'granted') {
    return offer.activation.accountRef === accountRef && offer.activation.ownerPrincipalRef === ownerPrincipalRef
      ? await grantedTrialResult(ctx, offer) : { kind: 'refused', code: 'trial_already_claimed' }
  }
  if (offer.activation.claimBy <= now) return { kind: 'refused', code: 'trial_expired' }
  if (await readAccountTrial(ctx, offer.environment, accountRef) !== null) return { kind: 'refused', code: 'trial_already_claimed' }
  const account = await readTrialAccount(ctx, accountRef)
  if (account?.ownerPrincipalRef !== ownerPrincipalRef) return { kind: 'refused', code: 'personal_account_required' }
  if (offer.recipient.kind === 'account' && offer.recipient.accountRef !== accountRef) return { kind: 'refused', code: 'trial_authority_invalid' }
  const grantRef = canonicalDigest({ format: 'ae.trial-credit-grant:v1', offerRef: offer.offerRef, accountRef })
  const expiresAt = now + TRIAL_DURATION_MS
  await ctx.db.insert('moneyPromotionalGrants', {
    grantRef, trialOfferRef: offer.offerRef, accountRef, environment: offer.environment,
    amountUnits: TRIAL_AMOUNT_UNITS, availableUnits: '0', expiresAt, createdAt: now, updatedAt: now,
    operationKey: offer.operationKey, actorRef: offer.actorRef, correlationId: offer.correlationId,
    commandDigest: offer.commandDigest, reasonCode: offer.reasonCode, evidenceRefs: offer.evidenceRefs,
    auditEventRef: offer.auditEventRef, bookingState: 'pending', nextWorkAt: now, expiryRevision: 0,
  })
  await ctx.db.patch(offer._id, {
    activation: { kind: 'granted', accountRef, ownerPrincipalRef, grantRef, activatedAt: now, expiresAt }, updatedAt: now,
  })
  await ctx.scheduler.runAfter(0, internal.moneyPromotionalCredit.process, { grantRef })
  return { kind: 'granted', accountRef, grantRef, expiresAt, booking: 'pending' }
}
