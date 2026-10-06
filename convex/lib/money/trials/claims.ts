import { v, type Infer } from 'convex/values'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { trialClaimResultValue } from '@/modules/money/public'
import { assertAdmission } from '../../platform/rateLimit'
import { activateTrialOffer, grantedTrialResult, readAccountTrial, readTrialAccount, type TrialClaimResult } from './activation'
import { trialOfferHasAuthority, trialOfferRef } from './authority'

export const verifiedClaimArgs = v.object({
  tokenIdentifier: v.string(), accountRef: v.string(), ownerPrincipalRef: v.string(), verifiedEmail: v.string(),
})
export const preparedClaimValue = v.union(trialClaimResultValue, v.object({
  kind: v.literal('verify_email'), tokenIdentifier: v.string(), clerkUserId: v.string(),
  accountRef: v.string(), ownerPrincipalRef: v.string(),
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

export async function prepareClaimHandler(ctx: MutationCtx): Promise<Infer<typeof preparedClaimValue>> {
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
  return { kind: 'verify_email', ...owner }
}

/** Requires Clerk backend verification, plus the same live canonical owner at
 * completion. Ensures the email offer alone selects the approved funding intent.
 * On changed identity, Account, ownership, environment or approval, write nothing. */
export async function finishClaimHandler(ctx: MutationCtx, args: Infer<typeof verifiedClaimArgs>): Promise<TrialClaimResult> {
  const owner = await personalClaimOwner(ctx)
  if (owner === null || owner.tokenIdentifier !== args.tokenIdentifier || owner.accountRef !== args.accountRef
    || owner.ownerPrincipalRef !== args.ownerPrincipalRef) return { kind: 'refused', code: 'personal_account_required' }
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) return { kind: 'refused', code: 'trial_verification_unavailable' }
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
