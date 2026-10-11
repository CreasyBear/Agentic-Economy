import { HOUR, MINUTE, RateLimiter, type RateLimitReturns, type RunMutationCtx } from '@convex-dev/rate-limiter'
import { degradeBackend } from '../../../src/lib/observability/degrade-backend'
import { components } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'
import { RATE_LIMIT_NAMES, RATE_LIMIT_POLICY, type RateLimitName } from '@/modules/security/rate-limit-policy'

export { RATE_LIMIT_NAMES }
export type { RateLimitName }

export type ConsequentialRateAdmission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'rate_limited'; retryAfter: number }>
  | Readonly<{ kind: 'unavailable' }>

const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMIT_POLICY)

const OCC_PATTERN = /changed while this (mutation|function) was being run|OptimisticConcurrencyControl/i
const OCC_RETRY_AFTER_MS = 250

// Hot per-principal buckets can exhaust Convex's built-in OCC retries. That is
// contention, not a denied limit or an outage: answer with a typed retryAfter.
export async function limitOrRetryAfter(limit: () => Promise<RateLimitReturns>): Promise<RateLimitReturns> {
  try {
    return await limit()
  } catch (cause) {
    if (cause instanceof Error && OCC_PATTERN.test(cause.message)) {
      return { ok: false, retryAfter: OCC_RETRY_AFTER_MS }
    }
    throw cause
  }
}

export async function assertAdmission(
  ctx: RunMutationCtx,
  input: Readonly<{ name: RateLimitName; key: string }>,
): Promise<RateLimitReturns> {
  return await limitOrRetryAfter(() => rateLimiter.limit(ctx, input.name, { key: input.key }))
}

export async function assertAgentAccessRateAdmission(
  ctx: RunMutationCtx,
  input: Readonly<{
    principalRef: string
    maximumCallsPerMinute: number
    maximumCallsPerHour: number
  }>,
): Promise<RateLimitReturns> {
  // Rate state belongs to the Agent. Credential rotation must not create a
  // fresh bucket, while the hour/minute token-bucket attempts stay separate.
  const key = `agent-access:${input.principalRef}`
  const hour = await limitOrRetryAfter(() => rateLimiter.limit(ctx, 'agent-access-hour', {
    key,
    config: {
      kind: 'token bucket',
      rate: Math.min(input.maximumCallsPerHour, 300),
      period: HOUR,
      capacity: Math.min(input.maximumCallsPerHour, 300),
    },
  }))
  if (!hour.ok) return hour
  return await limitOrRetryAfter(() => rateLimiter.limit(ctx, 'agent-access-minute', {
    key,
    config: {
      kind: 'token bucket',
      rate: Math.min(input.maximumCallsPerMinute, 60),
      period: MINUTE,
      capacity: Math.min(input.maximumCallsPerMinute, 60),
    },
  }))
}

export async function assertAuthorityCredentialChangeAdmission(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<RateLimitReturns> {
  return await limitOrRetryAfter(() => rateLimiter.limit(ctx, 'authority-credential-change', {
    key: `account:${activeAccountRef}`,
  }))
}

export async function assertPayoutTransferAdmission(
  ctx: RunMutationCtx,
  activeAccountRef: string,
): Promise<RateLimitReturns> {
  return await limitOrRetryAfter(() => rateLimiter.limit(ctx, 'payout-transfer', {
    key: `account:${activeAccountRef}`,
  }))
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
