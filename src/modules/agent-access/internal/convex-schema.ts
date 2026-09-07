import { defineTable } from 'convex/server'
import { v, type Infer, type Validator } from 'convex/values'

const identifier = v.string()
const exactAmount = v.object({ currency: identifier, units: identifier, exponent: v.number() })
const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
const budgetPolicy = v.object({
  budgetPolicyRef: identifier,
  generation: v.number(),
  currency: identifier,
  exponent: v.number(),
  maximumSpendPerCall: exactAmount,
  maximumDailySpend: exactAmount,
  maximumMonthlySpend: exactAmount,
  maximumConcurrentCalls: v.number(),
})
const protectedBudgetPolicy = v.object({
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
  budget: protectedBudgetPolicy,
  rate: ratePolicy,
})
const protectedV2Policy = v.object({
  format: v.literal('ae.agent-access-policy:v2'),
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  environment,
  budget: protectedBudgetPolicy,
  rate: ratePolicy,
})
const v2Policy = v.object({
  format: v.literal('ae.agent-access-policy:v2'),
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
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
  budgetPolicyRef: identifier,
  ratePolicyRef: identifier,
  lifecycle,
  generation: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
} as const
const protectedGrantFields = {
  ...grantFields,
  authorityMode: v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo')),
  policyDigest: identifier,
} as const
const targetGrantFields = {
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
  spendingPolicyDigest: identifier,
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
} as const

const legacyGrant = v.object({
  format: v.literal('ae.agent-access-grant:v1'),
  ...protectedGrantFields,
  operationAccess: v.literal('all_admitted'),
  policy: legacyPolicy,
})
const protectedV2Grant = v.object({
  format: v.literal('ae.agent-access-grant:v2'),
  ...protectedGrantFields,
  operationAccess: v.union(v.literal('all_admitted'), v.literal('selected_operations')),
  operationRefs: v.array(v.string()),
  policy: protectedV2Policy,
})
const normalizedLegacyGrant = v.object({
  format: v.literal('ae.agent-access-grant:v1'),
  ...targetGrantFields,
  toolAccess: v.literal('all_admitted'),
  toolRefs: v.array(v.string()),
  spendingPolicy: legacyPolicy,
})
const v2Grant = v.object({
  format: v.literal('ae.agent-access-grant:v2'),
  ...targetGrantFields,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  spendingPolicy: v2Policy,
})

/** New writes are v2-only. */
export const agentAccessGrantValue = v2Grant
export const agentAccessGrantV2Value = v2Grant
/** Storage accepts only exact protected historical/current shapes; hybrids are invalid. */
export const storedAgentAccessGrantValue = v.union(legacyGrant, protectedV2Grant, v2Grant)
export const normalizedAgentAccessGrantValue = v.union(normalizedLegacyGrant, v2Grant)

// Keep the generated document type patch-friendly across the compatibility
// window. The runtime validator remains the exact union above, so hybrid rows
// are still rejected by Convex before persistence.
const storedAgentAccessGrantDocumentType = v.object({
  format: v.union(v.literal('ae.agent-access-grant:v1'), v.literal('ae.agent-access-grant:v2')),
  ...grantFields,
  authorityMode: v.optional(v.union(
    v.literal('inspect_only'),
    v.literal('approve_each'),
    v.literal('bounded_mandate'),
    v.literal('full_yolo'),
    v.literal('read_only'),
    v.literal('approval_required'),
    v.literal('spending_policy'),
    v.literal('unrestricted_test_only'),
  )),
  operationAccess: v.optional(v.union(v.literal('all_admitted'), v.literal('selected_operations'))),
  operationRefs: v.optional(v.array(v.string())),
  toolAccess: v.optional(v.union(v.literal('all_admitted'), v.literal('selected_tools'))),
  toolRefs: v.optional(v.array(v.string())),
  policy: v.optional(v.union(legacyPolicy, protectedV2Policy)),
  spendingPolicyDigest: v.optional(identifier),
  spendingPolicy: v.optional(v.union(legacyPolicy, v2Policy)),
  policyDigest: v.optional(identifier),
})
const storedAgentAccessGrantTableValue = storedAgentAccessGrantValue as Validator<
  Infer<typeof storedAgentAccessGrantDocumentType>,
  'required',
  typeof storedAgentAccessGrantValue.fieldPaths
>

export const agentAccessPolicyTables = {
  agentAccessGrants: defineTable(storedAgentAccessGrantTableValue)
    .index('by_grantRef', ['grantRef'])
    .index('by_principalId', ['principalId'])
    .index('by_credentialId_and_environment_and_generation', ['credentialId', 'environment', 'generation'])
    .index('by_credentialId_and_environment_and_lifecycle', ['credentialId', 'environment', 'lifecycle'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt']),
} as const
