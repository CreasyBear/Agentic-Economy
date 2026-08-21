import { v } from 'convex/values'

import { sourceWriteArgs } from './sourceWriteAdmission'

export const identifier = v.string()
export const serverFunctionAuth = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(
    v.union(
      v.literal('inspect_only'),
      v.literal('approve_each'),
      v.literal('bounded_mandate'),
      v.literal('full_yolo'),
    ),
  ),
  issuedAt: v.number(),
  signature: v.string(),
})
export const exactAmount = v.object({
  currency: identifier,
  units: identifier,
  exponent: v.number(),
})
export const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}
export const moneyRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  retryable: v.boolean(),
})
export const billingSourceArgs = {
  operationKey: identifier,
  correlationId: identifier,
  ...sourceWriteArgs,
}
export const checkoutEventArg = v.object({
  kind: v.literal('checkout'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('checkout.session.completed'),
    v.literal('checkout.session.async_payment_succeeded'),
    v.literal('checkout.session.async_payment_failed'),
    v.literal('checkout.session.expired'),
  ),
  externalRef: identifier,
  sessionId: identifier,
  commandRef: identifier,
  paymentId: v.optional(identifier),
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  status: v.union(v.literal('paid'), v.literal('failed'), v.literal('expired')),
  amount: exactAmount,
  metadataDigest: identifier,
  payloadDigest: identifier,
  observedAt: v.number(),
})
export const accountUpdatedEventArg = v.object({
  kind: v.literal('account'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('account.updated'),
    v.literal('v2.core.account.created'),
    v.literal('v2.core.account.updated'),
    v.literal('v2.core.account.closed'),
    v.literal('v2.core.account[configuration.recipient].updated'),
    v.literal(
      'v2.core.account[configuration.recipient].capability_status_updated',
    ),
  ),
  externalRef: identifier,
  stripeAccountId: identifier,
  providerObjectDigest: identifier,
  payloadDigest: identifier,
  observedAt: v.number(),
})
export const stripeMoneyWebhookEventArg = v.union(
  checkoutEventArg,
  accountUpdatedEventArg,
)
