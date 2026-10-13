import { v, type Infer } from 'convex/values'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { trialClaimResultValue, COLOSSEUM_TRIAL_CODE, COLOSSEUM_TRIAL_MAX_CLAIMS, COLOSSEUM_TRIAL_CLAIM_BY } from '@/modules/money/public'
import { assertAdmission } from '../../platform/rateLimit'
import { activateTrialOffer, grantedTrialResult, readAccountTrial, readTrialAccount, type TrialClaimResult } from './activation'
import { trialOfferHasAuthority, trialOfferRef } from './authority'

export const verifiedClaimArgs = v.object({
  tokenIdentifier: v.string(), accountRef: v.string(), ownerPrincipalRef: v.string(), verifiedEmail: v.string(),
  code: v.optional(v.literal('COLOSSEUM')),
})
export const preparedClaimValue = v.union(trialClaimResultValue, v.object({
  kind: v.literal('verify_email'), tokenIdentifier: v.string(), clerkUserId: v.string(),
  accountRef: v.string(), ownerPrincipalRef: v.string(),
  code: v.optional(v.literal('COLOSSEUM')),
}))

async function personalClaimOwner(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  const actor = await resolveBusinessActor(ctx)
  if (identity === null || actor.kind !== 'authenticated_owner') return null
  const account = await readTrialAccount(ctx, actor.canonicalAccountRef)
  if (account?.ownerPrincipalRef !== actor.canonicalPrincipalRef) return null
  const organizations = await ctx.db.query('accountExternalOrganizationBindings').withIndex('by_accountRef_and_lifecycle', q => q
    .eq('accountRef', actor.canonicalAccountRef).eq('lifecycle', 'active')).take(1)
  if (organizations.length > 0) return null
  return { tokenIdentifier: identity.tokenIdentifier, clerkUserId: identity.subject,
    accountRef: actor.canonicalAccountRef, ownerPrincipalRef: actor.canonicalPrincipalRef }
}

export async function prepareClaimHandler(ctx: MutationCtx, args: { code?: string }): Promise<Infer<typeof preparedClaimValue>> {
  if (await ctx.auth.getUserIdentity() === null) return { kind: 'refused', code: 'authentication_required' }
  const owner = await personalClaimOwner(ctx)
  if (owner === null) return { kind: 'refused', code: 'personal_account_required' }
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'trial_verification_unavailable' }
  const existing = await readAccountTrial(ctx, environment, owner.accountRef)
  if (existing !== null) {
    if (existing.activation.kind !== 'granted' || existing.activation.ownerPrincipalRef !== owner.ownerPrincipalRef
      || !await trialOfferHasAuthority(ctx, existing)) return { kind: 'refused', code: 'trial_authority_invalid' }
    return await grantedTrialResult(ctx, existing)
  }
  const admission = await assertAdmission(ctx, { name: 'public-mutation', key: `trial-claim:${owner.tokenIdentifier}` })
  if (!admission.ok) return { kind: 'refused', code: 'trial_verification_unavailable' }
  const code = args.code?.trim().toUpperCase()
  if (args.code !== undefined && args.code.length > 32
    || code !== undefined && code !== '' && code !== COLOSSEUM_TRIAL_CODE) return { kind: 'refused', code: 'trial_code_invalid' }
  return { kind: 'verify_email', ...owner, ...(code === COLOSSEUM_TRIAL_CODE ? { code } : {}) }
}

/** Requires a Clerk-verified live personal owner and an original Admin-approved code.
 * Ensures one existing trial grant, with a stable 30-day expiry, per Account.
 * Invariant: the shared approval's counter and claim/booking intent commit together;
 * at most ten A$10 grants. Invalid/expired/exhausted claims write no credit.
 * Retries recover the Account's grant before consuming another campaign slot. */
async function redeemCode(ctx: MutationCtx, args: Infer<typeof verifiedClaimArgs>, environment: 'sandbox' | 'production'): Promise<TrialClaimResult> {
  const existing = await readAccountTrial(ctx, environment, args.accountRef)
  if (existing !== null) return await grantedTrialResult(ctx, existing)
  const approvalRef = trialOfferRef({ environment, recipient: { kind: 'code', code: COLOSSEUM_TRIAL_CODE,
    maxClaims: COLOSSEUM_TRIAL_MAX_CLAIMS, claimBy: COLOSSEUM_TRIAL_CLAIM_BY } })
  const approval = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', approvalRef)).unique()
  if (approval === null) return { kind: 'refused', code: 'trial_not_approved' }
  if (!await trialOfferHasAuthority(ctx, approval) || approval.recipient.kind !== 'code'
    || approval.codeCampaign?.kind !== 'approval') return { kind: 'refused', code: 'trial_authority_invalid' }
  const now = Date.now()
  if (approval.recipient.claimBy <= now) return { kind: 'refused', code: 'trial_expired' }
  if (approval.codeCampaign.claimedCount >= approval.recipient.maxClaims) return { kind: 'refused', code: 'trial_code_exhausted' }
  const position = approval.codeCampaign.claimedCount + 1
  const recipient = { kind: 'account' as const, accountRef: args.accountRef }
  const offerRef = trialOfferRef({ environment, recipient })
  if (await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', offerRef)).unique() !== null) {
    return { kind: 'refused', code: 'trial_already_claimed' }
  }
  // One shared document serializes the finite marketing budget under Convex OCC.
  await ctx.db.patch(approval._id, { codeCampaign: { kind: 'approval', claimedCount: position }, updatedAt: now })
  const id = await ctx.db.insert('moneyTrialOffers', {
    offerRef, environment, recipient, codeCampaign: { kind: 'claim', approvalRef, position },
    activation: { kind: 'unclaimed', claimBy: approval.recipient.claimBy }, delivery: { kind: 'not_required' },
    createdAt: now, updatedAt: now, actorRef: approval.actorRef, operationKey: approval.operationKey,
    correlationId: approval.correlationId, commandDigest: approval.commandDigest, auditEventRef: approval.auditEventRef,
    reasonCode: approval.reasonCode, evidenceRefs: approval.evidenceRefs,
    ...(approval.expectedStateDigest === undefined ? {} : { expectedStateDigest: approval.expectedStateDigest }),
  })
  const offer = await ctx.db.get(id)
  if (offer === null) throw new Error('trial_code_claim_insert_missing')
  const activated = await activateTrialOffer(ctx, offer, args.accountRef, args.ownerPrincipalRef, now)
  if (activated.kind !== 'granted') throw new Error('trial_code_activation_conflict')
  return activated
}

/** Requires Clerk backend verification, plus the same live canonical owner at
 * completion. Ensures the verified email or code selects original approved intent.
 * On changed identity, Account, ownership, environment or approval, write nothing. */
export async function finishClaimHandler(ctx: MutationCtx, args: Infer<typeof verifiedClaimArgs>): Promise<TrialClaimResult> {
  const owner = await personalClaimOwner(ctx)
  if (owner === null || owner.tokenIdentifier !== args.tokenIdentifier || owner.accountRef !== args.accountRef
    || owner.ownerPrincipalRef !== args.ownerPrincipalRef) return { kind: 'refused', code: 'personal_account_required' }
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'trial_verification_unavailable' }
  if (args.code !== undefined) return await redeemCode(ctx, args, environment)
  const offerRef = trialOfferRef({ environment, recipient: { kind: 'email', email: args.verifiedEmail } })
  const offer = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', offerRef)).unique()
  if (offer === null) return { kind: 'refused', code: 'trial_not_approved' }
  if (!await trialOfferHasAuthority(ctx, offer)) return { kind: 'refused', code: 'trial_authority_invalid' }
  return await activateTrialOffer(ctx, offer, owner.accountRef, owner.ownerPrincipalRef, Date.now())
}

export async function readCurrentTrialHandler(ctx: QueryCtx): Promise<TrialClaimResult> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'authentication_required' }
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'trial_verification_unavailable' }
  const account = await readTrialAccount(ctx, actor.canonicalAccountRef)
  const offer = await readAccountTrial(ctx, environment, actor.canonicalAccountRef)
  if (offer === null) return { kind: 'refused', code: 'trial_not_approved' }
  if (offer.activation.kind !== 'granted' || account?.ownerPrincipalRef !== offer.activation.ownerPrincipalRef
    || !await trialOfferHasAuthority(ctx, offer)) return { kind: 'refused', code: 'trial_authority_invalid' }
  return await grantedTrialResult(ctx, offer)
}
