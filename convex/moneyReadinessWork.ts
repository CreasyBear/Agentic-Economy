import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { paymentReadinessEnvironmentValue, paymentReadinessSnapshotValue } from '@/modules/money/payment-readiness'
import { paymentReadinessClaimValue } from '@/modules/money/payment-readiness'
import { claimPaymentReadinessWork, completePaymentReadinessWork, requestPaymentReadinessRecovery } from './lib/money/readiness/work'

const refused = v.object({ kind: v.literal('refused'), code: v.string() })
export const requestRecovery = internalMutation({
  args: { snapshotRef: v.string() }, returns: v.union(v.object({ kind: v.literal('requested') }), refused),
  handler: requestPaymentReadinessRecovery,
})
export const claim = internalMutation({
  args: { environment: paymentReadinessEnvironmentValue, token: v.optional(v.string()) },
  returns: v.union(paymentReadinessClaimValue, refused), handler: claimPaymentReadinessWork,
})
export const complete = internalMutation({
  args: { snapshot: paymentReadinessSnapshotValue, token: v.string() },
  returns: v.union(v.object({ kind: v.literal('published'), replayed: v.boolean() }), refused),
  handler: completePaymentReadinessWork,
})
