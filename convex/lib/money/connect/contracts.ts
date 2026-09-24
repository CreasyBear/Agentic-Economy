import { v } from 'convex/values'
import { identifier, moneyRefusalValue } from '../../../moneyLedgerValues'

export const connectAccountViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  state: v.union(
    v.literal('not_started'),
    v.literal('onboarding_started'),
    v.literal('submitted'),
    v.literal('restricted'),
    v.literal('ready'),
  ),
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: v.optional(identifier),
  lastStripePayloadDigest: v.optional(identifier),
  providerObjectVersion: v.optional(v.number()),
  lastStripeObservedAt: v.optional(v.number()),
  version: v.optional(v.number()),
  lastStripeEventId: v.optional(identifier),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const connectAccountResultValue = v.union(
  v.object({ kind: v.literal('accepted'), account: connectAccountViewValue }),
  moneyRefusalValue,
)
export const connectAccountCommandValue = v.object({
  commandRef: identifier,
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  providerRecoveryDeadlineAt: v.number(),
  recoveryLeaseGeneration: v.number(),
  recoveryLeaseOwner: v.optional(identifier),
  recoveryLeaseExpiresAt: v.optional(v.number()),
  state: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  stripeAccountId: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  failureCode: v.optional(identifier),
  failureRetryable: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const connectAccountReservationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    command: connectAccountCommandValue,
    execute: v.boolean(),
  }),
  moneyRefusalValue,
)

