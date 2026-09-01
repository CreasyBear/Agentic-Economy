import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const identifier = v.string()
const exactAmount = v.object({ currency: identifier, units: identifier, exponent: v.number() })
const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
const budgetPolicy = v.object({
  budgetPolicyRef: identifier,
  generation: v.number(),
  currency: identifier,
  exponent: v.number(),
  maximumSpendPerInvocation: exactAmount,
  maximumDailySpend: exactAmount,
  maximumMonthlySpend: exactAmount,
  maximumConcurrentInvocations: v.number(),
})
const ratePolicy = v.object({
  ratePolicyRef: identifier,
  generation: v.number(),
  maximumCallsPerMinute: v.number(),
  maximumCallsPerHour: v.number(),
})

const legacyPolicy = v.object({
  format: v.literal('ae.agent-access-policy:v1'),
  operationAccess: v.literal('all_admitted'),
  environment,
  budget: budgetPolicy,
  rate: ratePolicy,
})
const v2Policy = v.object({
  format: v.literal('ae.agent-access-policy:v2'),
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  environment,
  budget: budgetPolicy,
  rate: ratePolicy,
})

export const agentAccessPolicyValue = v2Policy
export const agentAccessPolicyV2Value = v2Policy
export const agentAccessBudgetPolicyValue = budgetPolicy
export const agentAccessRatePolicyValue = ratePolicy

const grantFields = {
  grantRef: identifier,
  principalId: identifier,
  ownerId: identifier,
  applicationRef: identifier,
  credentialId: identifier,
  environment,
  authorityMode,
  budgetPolicyRef: identifier,
  ratePolicyRef: identifier,
  lifecycle,
  generation: v.number(),
  policyDigest: identifier,
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
} as const

const legacyGrant = v.object({
  format: v.literal('ae.agent-access-grant:v1'),
  ...grantFields,
  operationAccess: v.literal('all_admitted'),
  policy: legacyPolicy,
})
const normalizedLegacyGrant = v.object({
  format: v.literal('ae.agent-access-grant:v1'),
  ...grantFields,
  operationAccess: v.literal('all_admitted'),
  operationRefs: v.array(v.string()),
  policy: legacyPolicy,
})
const v2Grant = v.object({
  format: v.literal('ae.agent-access-grant:v2'),
  ...grantFields,
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  policy: v2Policy,
})

/** New writes are v2-only. */
export const agentAccessGrantValue = v2Grant
export const agentAccessGrantV2Value = v2Grant
/** Storage accepts only the two exact historical shapes; hybrids are invalid. */
export const storedAgentAccessGrantValue = v.union(legacyGrant, v2Grant)
export const normalizedAgentAccessGrantValue = v.union(normalizedLegacyGrant, v2Grant)

// Keep the generated document type patch-friendly across the compatibility
// window. The runtime validator remains the exact union above, so hybrid rows
// are still rejected by Convex before persistence.
const storedAgentAccessGrantDocumentType = v.object({
  format: v.union(v.literal('ae.agent-access-grant:v1'), v.literal('ae.agent-access-grant:v2')),
  ...grantFields,
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.optional(v.array(v.string())),
  policy: v.object({
    format: v.union(v.literal('ae.agent-access-policy:v1'), v.literal('ae.agent-access-policy:v2')),
    operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
    operationRefs: v.optional(v.array(v.string())),
    environment,
    budget: budgetPolicy,
    rate: ratePolicy,
  }),
})

export const agentAccessPolicyTables = {
  agentAccessGrants: defineTable(storedAgentAccessGrantValue as unknown as typeof storedAgentAccessGrantDocumentType)
    .index('by_grantRef', ['grantRef'])
    .index('by_principalId', ['principalId'])
    .index('by_credentialId_and_environment_and_generation', ['credentialId', 'environment', 'generation'])
    .index('by_credentialId_and_environment_and_lifecycle', ['credentialId', 'environment', 'lifecycle'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt']),
} as const
