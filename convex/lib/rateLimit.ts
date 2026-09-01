import { HOUR, MINUTE, RateLimiter, type RateLimitConfig, type RateLimitReturns, type RunMutationCtx } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'

export const RATE_LIMIT_NAMES = [
  'public-read',
  'public-mutation',
  'oauth-issuance',
  'oauth-device-poll',
  'authority-credential-change',
  'payout-transfer',
  'chat-submit',
  'chat-anonymous',
  'chat-anonymous-edge',
  'dispute-open',
] as const

export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number]

export type ConsequentialRateAdmission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable' }>

type RateLimitDefinitions = Record<RateLimitName, RateLimitConfig>

const limits: RateLimitDefinitions = {
  'public-read': { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 120 },
  'public-mutation': { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  'oauth-issuance': { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  'oauth-device-poll': { kind: 'token bucket', rate: 24, period: MINUTE, capacity: 24 },
  'authority-credential-change': { kind: 'fixed window', rate: 5, period: 10 * MINUTE },
  'payout-transfer': { kind: 'fixed window', rate: 3, period: HOUR },
  'chat-submit': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
  'chat-anonymous': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
  'chat-anonymous-edge': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
  'dispute-open': { kind: 'token bucket', rate: 3, period: MINUTE, capacity: 3 },
}

const rateLimiter = new RateLimiter(components.rateLimiter, limits)

export async function assertAdmission(
  ctx: RunMutationCtx,
  input: Readonly<{ name: RateLimitName; key: string }>,
): Promise<RateLimitReturns> {
  return await rateLimiter.limit(ctx, input.name, { key: input.key })
}

export async function assertAgentAccessRateAdmission(
  ctx: RunMutationCtx,
  input: Readonly<{
    applicationRef: string
    credentialId: string
    maximumCallsPerMinute: number
    maximumCallsPerHour: number
  }>,
): Promise<RateLimitReturns> {
  const key = `agent-access:${input.applicationRef}:${input.credentialId}`
  const hour = await rateLimiter.limit(ctx, 'agent-access-hour', {
    key,
    config: {
      kind: 'token bucket',
      rate: Math.min(input.maximumCallsPerHour, 300),
      period: HOUR,
      capacity: Math.min(input.maximumCallsPerHour, 300),
    },
  })
  if (!hour.ok) return hour
  return await rateLimiter.limit(ctx, 'agent-access-minute', {
    key,
    config: {
      kind: 'token bucket',
      rate: Math.min(input.maximumCallsPerMinute, 60),
      period: MINUTE,
      capacity: Math.min(input.maximumCallsPerMinute, 60),
    },
  })
}

export async function assertAuthorityCredentialChangeAdmission(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<RateLimitReturns> {
  return await rateLimiter.limit(ctx, 'authority-credential-change', {
    key: `account:${activeAccountRef}`,
  })
}

export async function assertPayoutTransferAdmission(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<RateLimitReturns> {
  return await rateLimiter.limit(ctx, 'payout-transfer', {
    key: `account:${activeAccountRef}`,
  })
}

export async function admitAuthorityCredentialChangeRate(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<ConsequentialRateAdmission> {
  return await consequentialRateAdmission(
    () => assertAuthorityCredentialChangeAdmission(ctx, activeAccountRef),
  )
}

export async function admitPayoutTransferRate(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<ConsequentialRateAdmission> {
  return await consequentialRateAdmission(
    () => assertPayoutTransferAdmission(ctx, activeAccountRef),
  )
}

async function consequentialRateAdmission(
  limit: () => Promise<RateLimitReturns>,
): Promise<ConsequentialRateAdmission> {
  try {
    const result = await limit()
    return result.ok
      ? { kind: 'admitted' }
      : { kind: 'rate_limited', retryAfter: result.retryAfter }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function admissionKey(
  ctx: Pick<MutationCtx, 'auth'>,
  fallback = 'anonymous',
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? `pseudonymous:${fallback}` : `principal:${identity.tokenIdentifier}`
}
