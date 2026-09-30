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
  'agent-approval-email',
  'chat-submit',
  'chat-stream',
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
  'agent-approval-email': { kind: 'token bucket', rate: 3, period: HOUR_MS, capacity: 3 },
  'chat-submit': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-stream': { kind: 'token bucket', rate: 30, period: MINUTE_MS, capacity: 30 },
  'chat-anonymous': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'chat-anonymous-edge': { kind: 'token bucket', rate: 30, period: HOUR_MS, capacity: 30 },
  'dispute-open': { kind: 'token bucket', rate: 3, period: MINUTE_MS, capacity: 3 },
  'mcp-anonymous': { kind: 'token bucket', rate: 30, period: MINUTE_MS, capacity: 30 },
}
