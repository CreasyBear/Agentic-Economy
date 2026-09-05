import { v } from 'convex/values'

export const stripeWebhookDestinationValue = v.union(
  v.literal('snapshot'),
  v.literal('accounts_v2'),
)

export const stripeWebhookAdmissionResultValue = v.union(
  v.object({ kind: v.literal('accepted'), status: v.literal('queued') }),
  v.object({ kind: v.literal('accepted'), status: v.literal('replayed') }),
  v.object({ kind: v.literal('accepted'), status: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)

export const stripeWebhookWorkResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    appliedRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('reconciliation_required'),
    code: v.string(),
  }),
)
