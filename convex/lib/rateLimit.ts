import { HOUR, MINUTE, RateLimiter, type RateLimitReturns, type RunMutationCtx } from '@convex-dev/rate-limiter'
import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'

export const RATE_LIMIT_NAMES = [
  'public-read',
  'public-mutation',
  'oauth-issuance',
  'answer-turn-submit',
  'answer-stream',
  'chat-submit',
  'dispute-open',
] as const

export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number]

type RateLimitDefinitions = Record<RateLimitName, {
  kind: 'token bucket'
  rate: number
  period: number
  capacity: number
}>

const limits: RateLimitDefinitions = {
  'public-read': { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 120 },
  'public-mutation': { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  'oauth-issuance': { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 5 },
  'answer-turn-submit': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
  'answer-stream': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
  'chat-submit': { kind: 'token bucket', rate: 30, period: HOUR, capacity: 30 },
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

export async function admissionKey(
  ctx: Pick<MutationCtx, 'auth'>,
  fallback = 'anonymous',
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? `pseudonymous:${fallback}` : `principal:${identity.tokenIdentifier}`
}
