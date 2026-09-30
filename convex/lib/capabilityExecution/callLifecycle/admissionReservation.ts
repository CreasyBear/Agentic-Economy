import { v } from 'convex/values'
import type { CallIdempotencyReservation } from '@/modules/capability-execution/call-authority'
import { environment } from './contracts'

export const reserveArgs = {
  quoteRef: v.string(), callRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, toolRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
  toolJson: v.optional(v.string()), inputJson: v.optional(v.string()), now: v.number(), turnRef: v.optional(v.string()),
  organizationMonthlySpend: v.optional(v.object({
    enabled: v.boolean(),
    ceilingUnits: v.optional(v.string()),
    monthSpendUnits: v.optional(v.string()),
  })),
} as const
export const reservationValue = v.object({
  quoteRef: v.string(),
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  policyDigest: v.string(),
  grantExpiresAt: v.number(),
  environment,
  toolRef: v.string(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  requestDigest: v.string(),
  callRef: v.string(),
})
export const reserveRefusalCode = v.union(
  v.literal('operation_not_ready'),
  v.literal('grant_not_found'),
  v.literal('grant_revoked'),
  v.literal('grant_expired'),
  v.literal('grant_generation_stale'),
  v.literal('environment_mismatch'),
  v.literal('rate_limited'),
  v.literal('concurrency_limited'),
  v.literal('budget_exceeded'),
  v.literal('insufficient_balance'),
  v.literal('treasury_capacity_unavailable'),
  v.literal('commercial_policy_unavailable'),
)
export const reserveResult = v.union(
  v.object({ kind: v.literal('reserved'), reservation: reservationValue }),
  v.object({ kind: v.literal('replayed'), reservation: reservationValue }),
  v.object({ kind: v.literal('conflict') }),
  v.object({ kind: v.literal('refused'), code: reserveRefusalCode, retryable: v.boolean(), nextAction: v.optional(v.string()) }),
)
export const abandonArgs = {
  reservationAttemptGeneration: v.optional(v.number()),
  quoteRef: v.string(), callRef: v.string(), principalId: v.string(), ownerId: v.string(), credentialId: v.string(),
  applicationRef: v.string(), grantRef: v.string(), environment, toolRef: v.string(), idempotencyKey: v.string(),
  inputDigest: v.string(), requestDigest: v.string(), grantGeneration: v.number(), policyDigest: v.string(), grantExpiresAt: v.number(),
  turnRef: v.optional(v.string()),
} as const
export const abandonResult = v.union(
  v.object({ kind: v.literal('abandoned') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('dispatch_started') }),
)

export type ReserveArgs = Readonly<{
  quoteRef: string
  callRef: string
  turnRef?: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  grantRef: string
  environment: 'sandbox' | 'production'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson?: string
  inputJson?: string
  now: number
  organizationMonthlySpend?: Readonly<{
    enabled: boolean
    ceilingUnits?: string
    monthSpendUnits?: string
  }>
}>

export type ReserveResult =
  | { kind: 'reserved'; reservation: CallIdempotencyReservation }
  | { kind: 'replayed'; reservation: CallIdempotencyReservation }
  | { kind: 'conflict' }
  | {
      kind: 'refused'
      code:
        | 'grant_not_found'
        | 'grant_revoked'
        | 'grant_expired'
        | 'grant_generation_stale'
        | 'environment_mismatch'
        | 'rate_limited'
        | 'concurrency_limited'
        | 'budget_exceeded'
        | 'insufficient_balance'
        | 'treasury_capacity_unavailable'
        | 'commercial_policy_unavailable'
        | 'operation_not_ready'
      retryable: boolean
      nextAction?: string
    }

export type AbandonArgs = Omit<ReserveArgs, 'toolJson' | 'inputJson' | 'now'> & { reservationAttemptGeneration?: number }

export type AbandonResult =
  | { kind: 'abandoned' }
  | { kind: 'not_found' }
  | { kind: 'dispatch_started' }
