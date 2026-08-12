import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const identifier = v.string()
const exactAmount = v.object({ currency: identifier, units: identifier, exponent: v.number() })
const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const operationAccess = v.literal('all_admitted')
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
const policy = v.object({
  format: v.literal('ae.agent-access-policy:v1'),
  operationAccess,
  environment,
  budget: budgetPolicy,
  rate: ratePolicy,
})
export const agentAccessPolicyValue = policy
export const agentAccessBudgetPolicyValue = budgetPolicy
export const agentAccessRatePolicyValue = ratePolicy

export const agentAccessGrantValue = v.object({
  format: v.literal('ae.agent-access-grant:v1'),
  grantRef: identifier,
  principalId: identifier,
  ownerId: identifier,
  applicationRef: identifier,
  credentialId: identifier,
  environment,
  operationAccess,
  authorityMode,
  policy,
  budgetPolicyRef: identifier,
  ratePolicyRef: identifier,
  lifecycle,
  generation: v.number(),
  policyDigest: identifier,
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
})

export const agentAccessPolicyTables = {
  agentAccessGrants: defineTable({
    format: v.literal('ae.agent-access-grant:v1'),
    grantRef: identifier,
    principalId: identifier,
    ownerId: identifier,
    applicationRef: identifier,
    credentialId: identifier,
    environment,
    operationAccess,
    authorityMode,
    policy,
    budgetPolicyRef: identifier,
    ratePolicyRef: identifier,
    lifecycle,
    generation: v.number(),
    policyDigest: identifier,
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_grantRef', ['grantRef'])
    .index('by_principalId', ['principalId'])
    .index('by_credentialId_and_environment_and_generation', ['credentialId', 'environment', 'generation'])
    .index('by_credentialId_and_environment_and_lifecycle', ['credentialId', 'environment', 'lifecycle'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt']),
 
} as const