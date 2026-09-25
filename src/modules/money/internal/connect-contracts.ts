import { v, type Infer } from 'convex/values'

export const connectAccountViewValue = v.object({
  businessId: v.string(),
  currency: v.string(),
  exponent: v.number(),
  stripeAccountId: v.string(),
  state: v.union(
    v.literal('not_started'),
    v.literal('onboarding_started'),
    v.literal('submitted'),
    v.literal('restricted'),
    v.literal('ready'),
  ),
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  requirementsDigest: v.string(),
  providerObjectDigest: v.optional(v.string()),
  lastStripePayloadDigest: v.optional(v.string()),
  providerObjectVersion: v.optional(v.number()),
  lastStripeObservedAt: v.optional(v.number()),
  version: v.optional(v.number()),
  lastStripeEventId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export type ConnectAccountView = Readonly<Infer<typeof connectAccountViewValue>>

export const connectAccountCommandValue = v.object({
  commandRef: v.string(),
  businessId: v.string(),
  currency: v.string(),
  exponent: v.number(),
  idempotencyKey: v.string(),
  inputDigest: v.string(),
  providerRequestDigest: v.string(),
  providerRecoveryDeadlineAt: v.number(),
  recoveryLeaseGeneration: v.number(),
  recoveryLeaseOwner: v.optional(v.string()),
  recoveryLeaseExpiresAt: v.optional(v.number()),
  state: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  stripeAccountId: v.optional(v.string()),
  providerEvidenceRef: v.optional(v.string()),
  failureCode: v.optional(v.string()),
  failureRetryable: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export type ConnectAccountCommandView = Readonly<Infer<typeof connectAccountCommandValue>>

export const connectAccountFinalizeOutcomeArg = v.union(
  v.object({
    state: v.literal('succeeded'),
    stripeAccountId: v.string(),
    providerEvidenceRef: v.string(),
  }),
  v.object({
    state: v.union(v.literal('failed'), v.literal('outcome_unknown')),
    failureCode: v.string(),
    failureRetryable: v.boolean(),
  }),
)

export type ConnectAccountOutcome = Readonly<Infer<typeof connectAccountFinalizeOutcomeArg>>
