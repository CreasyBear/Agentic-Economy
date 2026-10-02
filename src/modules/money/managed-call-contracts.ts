import { v } from 'convex/values'
import { spendingPeriodsValue } from './internal/spending-period-values'
import { promotionalCreditAllocationValue } from './promotional-credit-contracts'

/** Existing Call recipes retain their immutable schema/command identity as refunds evolve. */
export const MANAGED_CALL_FORMANCE_SCHEMA_VERSION = 'v1.5.0' as const

/** Frozen financial identity shared by Call consequences and settled-sale reports. */
export const managedCallBookingValue = v.object({
  callRef: v.string(),
  quoteRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  toolRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  quoteDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
  spendingPeriods: v.optional(spendingPeriodsValue),
  promotionalCreditAllocation: v.optional(promotionalCreditAllocationValue),
})
