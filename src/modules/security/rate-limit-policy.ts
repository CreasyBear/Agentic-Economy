/**
 * Single source of truth for the rate-limit policy: per-scope capacity,
 * refill rate, and window. Both the Convex `@convex-dev/rate-limiter`
 * configuration (`convex/lib/rateLimit.ts`, which feeds it straight to the
 * `RateLimiter` component) and the HTTP `RateLimit-*` response headers
 * (`src/lib/server/rate-limit.ts`, which reads capacity/window for the
 * headers) import this. Change a scope's numbers here once.
 */

export const SECOND_MS = 1_000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS

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
  'mcp-anonymous',
] as const

export type RateLimitName = (typeof RATE_LIMIT_NAMES)[number]

export type TokenBucketPolicy = Readonly<{ kind: 'token bucket'; rate: number; period: number; capacity: number }>
export type FixedWindowPolicy = Readonly<{ kind: 'fixed window'; rate: number; period: number }>
export type RateLimitPolicyConfig = TokenBucketPolicy | FixedWindowPolicy

export const RATE_LIMIT_POLICY: Record<RateLimitName, RateLimitPolicyConfig> = {
  'public-read': { kind: 'token bucket', rate: 120, period: MINUTE_MS, capacity: 120 },
  'public-mutation': { kind: 'token bucket', rate: 5, period: MINUTE_MS, capacity: 5 },
  'oauth-issuance': { kind: 'token bucket', rate: 5, period: MINUTE_MS, capacity: 5 },
  'oauth-device-poll': { kind: 'token bucket', rate: 24, period: MINUTE_MS, capacity: 24 },
  'authority-credential-change': { kind: 'fixed window', rate: 5, period: 10 * MINUTE_MS },
  'payout-transfer': { kind: 'fixed window', rate: 3, period: HOUR_MS },
  'chat-submit': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-anonymous': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-anonymous-edge': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'dispute-open': { kind: 'token bucket', rate: 3, period: MINUTE_MS, capacity: 3 },
  'mcp-anonymous': { kind: 'token bucket', rate: 30, period: MINUTE_MS, capacity: 30 },
}

/**
 * The scopes admitted through the public `rateLimit:admitHttp` mutation and
 * reported on HTTP responses as `RateLimit-*` headers. All of today's
 * HTTP-facing scopes are token buckets (see `RATE_LIMIT_POLICY` above).
 */
export const HTTP_RATE_LIMIT_NAMES = [
  'public-read',
  'public-mutation',
  'oauth-issuance',
  'oauth-device-poll',
  'chat-anonymous-edge',
  'mcp-anonymous',
] as const

export type HttpRateLimitName = (typeof HTTP_RATE_LIMIT_NAMES)[number]

/** The configured ceiling for a scope: token bucket capacity, or fixed-window rate. */
export function httpRateLimitCapacity(name: HttpRateLimitName): number {
  const policy = RATE_LIMIT_POLICY[name]
  return policy.kind === 'token bucket' ? policy.capacity : policy.rate
}

/** The scope's configured window in milliseconds (the worst-case time to a full refill). */
export function httpRateLimitWindowMs(name: HttpRateLimitName): number {
  return RATE_LIMIT_POLICY[name].period
}
