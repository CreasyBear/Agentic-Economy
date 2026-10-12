/** Shared policy used by the Convex rate limiter and HTTP admission. */

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
  'email-transactional',
  'email-alert',
  'email-lifecycle',
  'chat-submit',
  'chat-stream',
  'chat-anonymous',
  'chat-anonymous-edge',
  'chat-anonymous-global',
  'dispute-open',
  'paid-call-report',
  'mcp-anonymous',
  'mcp-authentication',
  'funding-checkout',
  'funding-checkout-ip',
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
  'email-transactional': { kind: 'token bucket', rate: 3, period: HOUR_MS, capacity: 3 },
  'email-alert': { kind: 'token bucket', rate: 3, period: HOUR_MS, capacity: 3 },
  'email-lifecycle': { kind: 'token bucket', rate: 3, period: HOUR_MS, capacity: 3 },
  'chat-submit': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-stream': { kind: 'token bucket', rate: 30, period: MINUTE_MS, capacity: 30 },
  'chat-anonymous': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-anonymous-edge': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'paid-call-report': { kind: 'token bucket', rate: 5, period: MINUTE_MS, capacity: 5 },
  // Global daily budget across all IPs (OWASP API4 / LLM10); bot challenge is a separate product decision, no vendor added.
  'chat-anonymous-global': { kind: 'fixed window', rate: 5_000, period: 24 * HOUR_MS },
  'dispute-open': { kind: 'token bucket', rate: 3, period: MINUTE_MS, capacity: 3 },
  'mcp-anonymous': { kind: 'token bucket', rate: 30, period: MINUTE_MS, capacity: 30 },
  // Bound verification before Clerk without charging native authenticated discovery to the anonymous quota.
  'mcp-authentication': { kind: 'token bucket', rate: 120, period: MINUTE_MS, capacity: 120 },
  // Stripe card-testing guidance: rate limit Checkout Session creation.
  'funding-checkout': { kind: 'fixed window', rate: 5, period: HOUR_MS },
  // Looser per-IP guard: retries replay without consuming the per-Account quota, and many owners can share one IP.
  'funding-checkout-ip': { kind: 'fixed window', rate: 30, period: HOUR_MS },
}
