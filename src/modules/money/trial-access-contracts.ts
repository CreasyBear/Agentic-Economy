import { v } from 'convex/values'

export const TRIAL_AMOUNT_UNITS = '10000000'
export const TRIAL_DURATION_MS = 30 * 86_400_000
export const COLOSSEUM_TRIAL_CODE = 'COLOSSEUM'
export const COLOSSEUM_TRIAL_MAX_CLAIMS = 10
// Redemption closes at the end of 30 November in Australia/Perth.
export const COLOSSEUM_TRIAL_CLAIM_BY = Date.UTC(2026, 10, 30, 16)
export const trialClaimArgs = { code: v.optional(v.string()) }

export const trialRecipientValue = v.union(
  v.object({ kind: v.literal('email'), email: v.string() }),
  v.object({ kind: v.literal('account'), accountRef: v.string() }),
  v.object({ kind: v.literal('code'), code: v.literal('COLOSSEUM'), maxClaims: v.literal(10), claimBy: v.number() }),
)
export const trialActivationValue = v.union(
  v.object({ kind: v.literal('unclaimed'), claimBy: v.number() }),
  v.object({ kind: v.literal('granted'), accountRef: v.string(), ownerPrincipalRef: v.string(), grantRef: v.string(), activatedAt: v.number(), expiresAt: v.number() }),
)
export const trialDeliveryValue = v.union(
  v.object({ kind: v.literal('not_required') }),
  v.object({ kind: v.literal('queued') }),
  v.object({ kind: v.literal('sending'), attemptRef: v.string(), startedAt: v.number() }),
  v.object({ kind: v.literal('sent'), invitationRef: v.string() }),
  v.object({ kind: v.literal('unknown'), attemptRef: v.string() }),
  v.object({ kind: v.literal('failed'), code: v.string() }),
)
export const trialClaimResultValue = v.union(
  v.object({ kind: v.literal('granted'), grantRef: v.string(), accountRef: v.string(), expiresAt: v.number(), booking: v.union(v.literal('pending'), v.literal('booked')) }),
  v.object({ kind: v.literal('refused'), code: v.union(
    v.literal('authentication_required'), v.literal('personal_account_required'),
    v.literal('verified_email_required'), v.literal('trial_not_approved'),
    v.literal('trial_expired'), v.literal('trial_already_claimed'),
    v.literal('trial_authority_invalid'), v.literal('trial_verification_unavailable'),
    v.literal('trial_code_invalid'), v.literal('trial_code_exhausted'),
  ) }),
)
