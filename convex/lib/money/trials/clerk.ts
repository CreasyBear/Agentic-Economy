"use node"

import { createClerkClient } from '@clerk/backend'
import { env, type ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { TrialClaimResult } from './activation'
import type { Infer } from 'convex/values'
import type { deliveryOutcomeValue } from './delivery'

export async function claimTrialHandler(ctx: ActionCtx, args: { code?: string }): Promise<TrialClaimResult> {
  const prepared = await ctx.runMutation(internal.trialAccess.prepareClaim, args)
  if (prepared.kind !== 'verify_email') return prepared
  const secretKey = env.CLERK_SECRET_KEY?.trim()
  if (!secretKey) return { kind: 'refused', code: 'trial_verification_unavailable' }
  let verifiedEmail: string
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(prepared.clerkUserId)
    const primary = user.primaryEmailAddress
    if (user.id !== prepared.clerkUserId || primary?.verification?.status !== 'verified') {
      return { kind: 'refused', code: 'verified_email_required' }
    }
    verifiedEmail = primary.emailAddress.trim().toLowerCase()
  } catch {
    return { kind: 'refused', code: 'trial_verification_unavailable' }
  }
  return await ctx.runMutation(internal.trialAccess.finishClaim, {
    tokenIdentifier: prepared.tokenIdentifier, accountRef: prepared.accountRef,
    ownerPrincipalRef: prepared.ownerPrincipalRef, verifiedEmail,
    ...(prepared.code === undefined ? {} : { code: prepared.code }),
  })
}

export async function deliverInvitationHandler(ctx: ActionCtx, args: { offerRef: string }): Promise<boolean> {
  const work = await ctx.runMutation(internal.trialAccess.claimDelivery, args)
  if (work === null) return true
  const secretKey = env.CLERK_SECRET_KEY?.trim()
  let outcome: Infer<typeof deliveryOutcomeValue> = { kind: 'unknown' }
  if (!secretKey) {
    if (work.kind === 'send') outcome = { kind: 'failed', code: 'clerk_not_configured' }
  } else {
    const clerk = createClerkClient({ secretKey })
    try {
      if (work.kind === 'reconcile') {
        const list = await clerk.invitations.getInvitationList({ query: work.email, limit: 100 })
        const matching = list.data.filter(invitation => invitation.emailAddress.trim().toLowerCase() === work.email
          && invitation.publicMetadata?.aeTrialOfferRef === args.offerRef && invitation.publicMetadata?.aeTrialAttemptRef === work.attemptRef)
        const invitation = matching.length === 1 ? matching[0] : undefined
        if (invitation !== undefined) outcome = { kind: 'sent', invitationRef: invitation.id }
      } else {
        const configured = env.AE_SITE_URL?.trim() ?? env.SITE_URL?.trim()
        const url = configured === undefined ? null : new URL(configured)
        if (url === null || url.username || url.password || url.pathname !== '/'
          || (url.protocol !== 'https:' && !(work.environment === 'sandbox' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
          outcome = { kind: 'failed', code: 'site_not_configured' }
        } else {
          const invitation = await clerk.invitations.createInvitation({
            emailAddress: work.email, expiresInDays: 30, ignoreExisting: false, notify: true,
            redirectUrl: new URL('/sign-up?redirect=%2Ftrial', url.origin).href,
            publicMetadata: { aeTrialOfferRef: args.offerRef, aeTrialAttemptRef: work.attemptRef },
          })
          outcome = { kind: 'sent', invitationRef: invitation.id }
        }
      }
    } catch (cause) {
      if (work.kind === 'send' && typeof cause === 'object' && cause !== null && 'status' in cause
        && typeof cause.status === 'number' && cause.status >= 400 && cause.status < 500 && cause.status !== 429) {
        outcome = { kind: 'failed', code: 'invitation_rejected' }
      }
    }
  }
  return await ctx.runMutation(internal.trialAccess.finishDelivery, { ...args, attemptRef: work.attemptRef, outcome })
}
