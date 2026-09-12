import { HOUR, MINUTE, RateLimiter, type RateLimitReturns, type RunMutationCtx } from '@convex-dev/rate-limiter'
import { degradeBackend } from '../../src/lib/observability/degrade-backend'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import { RATE_LIMIT_NAMES, RATE_LIMIT_POLICY, type RateLimitName } from '@/modules/security/rate-limit-policy'

export { RATE_LIMIT_NAMES }
export type { RateLimitName }

export type ConsequentialRateAdmission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable' }>

const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_POLICY)

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
  } catch (cause) {
    return degradeBackend(cause, { kind: 'unavailable' as const }, { site: 'consequentialRateAdmission', reason: 'source_unavailable' })
  }
}

export async function admissionKey(
  ctx: Pick<MutationCtx, 'auth'>,
  fallback = 'anonymous',
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? `pseudonymous:${fallback}` : `principal:${identity.tokenIdentifier}`
}
