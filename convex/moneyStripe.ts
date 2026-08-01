"use node"

import { internalAction } from './_generated/server'
import { v } from 'convex/values'

const identifier = v.string()

const stripeSetupRequired = {
  kind: 'refused' as const,
  code: 'stripe_setup_required' as const,
  retryable: false,
}

export const createCreditPayment = internalAction({
  args: {
    principalId: identifier,
    accountRef: identifier,
    currency: identifier,
    amountMinor: v.number(),
    idempotencyKey: identifier,
    inputDigest: identifier,
    successReturnRef: identifier,
  },
  handler: async () => stripeSetupRequired,
})

export const readCreditPayment = internalAction({
  args: { externalRef: identifier, idempotencyKey: identifier },
  handler: async () => stripeSetupRequired,
})

export const createConnectAccount = internalAction({
  args: { businessId: identifier, currency: identifier, idempotencyKey: identifier, configuration: v.literal('accounts_v2') },
  handler: async () => stripeSetupRequired,
})

export const createOnboardingLink = internalAction({
  args: { businessId: identifier, stripeAccountId: identifier, refreshRef: identifier, returnRef: identifier, idempotencyKey: identifier },
  handler: async () => stripeSetupRequired,
})

export const createProviderTransfer = internalAction({
  args: { payoutRef: identifier, businessId: identifier, stripeAccountId: identifier, currency: identifier, amountMinor: v.number(), idempotencyKey: identifier },
  handler: async () => stripeSetupRequired,
})

export const readProviderTransfer = internalAction({
  args: { externalRef: v.optional(identifier), idempotencyKey: identifier },
  handler: async () => stripeSetupRequired,
})
