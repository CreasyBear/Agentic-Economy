import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compareExactAmounts, exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import {
  AGENT_ACCESS_ENVIRONMENT_VALUES,
  type AgentAccessEnvironment,
} from './agent-access'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  type AgentAccessAuthorityMode,
} from './contract'

export {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  AGENT_ACCESS_ENVIRONMENT_VALUES,
}
export type { AgentAccessAuthorityMode, AgentAccessEnvironment }

export const AGENT_ACCESS_POLICY_FORMAT = 'ae.agent-access-policy:v1' as const
export const AGENT_ACCESS_GRANT_FORMAT = 'ae.agent-access-grant:v1' as const
export const AGENT_ACCESS_OPERATION_ACCESS_VALUES = ['all_admitted'] as const
export const AGENT_ACCESS_LIFECYCLE_VALUES = ['active', 'revoked', 'expired'] as const

export type AgentAccessOperationAccess = typeof AGENT_ACCESS_OPERATION_ACCESS_VALUES[number]
export type AgentAccessLifecycle = typeof AGENT_ACCESS_LIFECYCLE_VALUES[number]

const identifier = z.string().trim().min(1).max(300)
const positiveSafeInteger = z.number().int().safe().positive()
const nonNegativeSafeInteger = z.number().int().safe().nonnegative()
const money = exactAmountSchema
const environment = z.enum(AGENT_ACCESS_ENVIRONMENT_VALUES)
const authorityMode = z.enum(AGENT_ACCESS_AUTHORITY_MODE_VALUES)

export const agentAccessBudgetPolicySchema = z.strictObject({
  budgetPolicyRef: identifier,
  generation: positiveSafeInteger,
  currency: identifier,
  exponent: nonNegativeSafeInteger,
  maximumSpendPerInvocation: money,
  maximumDailySpend: money,
  maximumMonthlySpend: money,
  maximumConcurrentInvocations: positiveSafeInteger,
}).superRefine((value, context) => {
  const amounts = [
    value.maximumSpendPerInvocation,
    value.maximumDailySpend,
    value.maximumMonthlySpend,
  ]
  for (const amount of amounts) {
    if (amount.currency !== value.currency || amount.exponent !== value.exponent) {
      context.addIssue({ code: 'custom', message: 'budget_currency_mismatch', path: ['currency'] })
      break
    }
  }
  if (compareExactAmounts(value.maximumSpendPerInvocation, value.maximumDailySpend) === 1) {
    context.addIssue({ code: 'custom', message: 'per_invocation_exceeds_daily', path: ['maximumSpendPerInvocation'] })
  }
  if (compareExactAmounts(value.maximumDailySpend, value.maximumMonthlySpend) === 1) {
    context.addIssue({ code: 'custom', message: 'daily_exceeds_monthly', path: ['maximumDailySpend'] })
  }
})
export type AgentAccessBudgetPolicy = z.infer<typeof agentAccessBudgetPolicySchema>

export const agentAccessRatePolicySchema = z.strictObject({
  ratePolicyRef: identifier,
  generation: positiveSafeInteger,
  maximumCallsPerMinute: positiveSafeInteger,
  maximumCallsPerHour: positiveSafeInteger,
}).superRefine((value, context) => {
  if (value.maximumCallsPerMinute > value.maximumCallsPerHour) {
    context.addIssue({ code: 'custom', message: 'minute_rate_exceeds_hour', path: ['maximumCallsPerMinute'] })
  }
})
export type AgentAccessRatePolicy = z.infer<typeof agentAccessRatePolicySchema>

export const agentAccessPolicySchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_POLICY_FORMAT),
  operationAccess: z.literal('all_admitted'),
  environment,
  budget: agentAccessBudgetPolicySchema,
  rate: agentAccessRatePolicySchema,
})
export type AgentAccessPolicy = z.infer<typeof agentAccessPolicySchema>

export type AgentAccessGrant = Readonly<{
  format: typeof AGENT_ACCESS_GRANT_FORMAT
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessEnvironment
  operationAccess: AgentAccessOperationAccess
  authorityMode: AgentAccessAuthorityMode
  policy: AgentAccessPolicy
  budgetPolicyRef: string
  ratePolicyRef: string
  lifecycle: AgentAccessLifecycle
  generation: number
  policyDigest: string
  createdAt: number
  updatedAt: number
  expiresAt: number
}>

export type AgentAccessGrantReadback = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessEnvironment
  authorityMode: AgentAccessAuthorityMode
  operationAccess: AgentAccessOperationAccess
  lifecycle: AgentAccessLifecycle
  generation: number
  policyDigest: string
  budget: AgentAccessBudgetPolicy
  rate: AgentAccessRatePolicy
  createdAt: number
  updatedAt: number
  expiresAt: number
}>
export type AgentAccessOwnerGrantReadback = Readonly<{
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  authorityMode: AgentAccessAuthorityMode
  lifecycle: AgentAccessLifecycle
  expiresAt: number
  budget: Readonly<{
    maximumSpendPerInvocation: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
    maximumConcurrentInvocations: number
  }>
  rate: Readonly<{
    maximumCallsPerMinute: number
    maximumCallsPerHour: number
  }>
}>


export type AgentAccessGrantInput = Readonly<Omit<AgentAccessGrant, 'format' | 'policyDigest' | 'budgetPolicyRef' | 'ratePolicyRef'> & {
  policy: AgentAccessPolicy
  budgetPolicyRef?: string
  ratePolicyRef?: string
}>

export type AgentAccessPolicyRefusalCode =
  | 'grant_material_invalid'
  | 'grant_not_active'
  | 'grant_expired'
  | 'grant_generation_stale'
  | 'grant_principal_mismatch'
  | 'grant_application_mismatch'
  | 'grant_environment_mismatch'
  | 'spend_limit_exceeded'
  | 'budget_currency_mismatch'

export type AgentAccessPolicyDecision =
  | Readonly<{ kind: 'accepted'; grant: AgentAccessGrant }>
  | Readonly<{ kind: 'refused'; code: AgentAccessPolicyRefusalCode }>

export type AgentAccessOperationFacts = Readonly<{
  operationRef: string
  spend?: ExactAmount
}>

export type AgentAccessOperationDecision =
  | Readonly<{ kind: 'accepted'; grantRef: string; generation: number }>
  | Readonly<{ kind: 'refused'; code: AgentAccessPolicyRefusalCode }>

export function agentAccessPolicyDigest(policy: AgentAccessPolicy): string {
  return canonicalDigest(policy as never)
}

export function createAgentAccessGrant(input: AgentAccessGrantInput): AgentAccessPolicyDecision {
  const policy = agentAccessPolicySchema.safeParse(input.policy)
  if (!policy.success) return { kind: 'refused', code: 'grant_material_invalid' }
  if (policy.data.environment !== input.environment) return { kind: 'refused', code: 'grant_environment_mismatch' }
  if (input.environment === 'production' && input.authorityMode === 'full_yolo') {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  if (!Number.isSafeInteger(input.generation) || input.generation < 1 || !Number.isFinite(input.createdAt)
    || !Number.isFinite(input.updatedAt) || !Number.isFinite(input.expiresAt) || input.expiresAt <= input.createdAt) {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  const budgetPolicyRef = input.budgetPolicyRef ?? policy.data.budget.budgetPolicyRef
  const ratePolicyRef = input.ratePolicyRef ?? policy.data.rate.ratePolicyRef
  const policyDigest = agentAccessPolicyDigest(policy.data)
  return {
    kind: 'accepted',
    grant: Object.freeze({
      format: AGENT_ACCESS_GRANT_FORMAT,
      grantRef: input.grantRef,
      principalId: input.principalId,
      ownerId: input.ownerId,
      applicationRef: input.applicationRef,
      credentialId: input.credentialId,
      environment: input.environment,
      operationAccess: input.operationAccess,
      authorityMode: input.authorityMode,
      policy: policy.data,
      budgetPolicyRef,
      ratePolicyRef,
      lifecycle: input.lifecycle,
      generation: input.generation,
      policyDigest,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      expiresAt: input.expiresAt,
    }),
  }
}

export function projectAgentAccessGrant(grant: AgentAccessGrant): AgentAccessGrantReadback {
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    authorityMode: grant.authorityMode,
    operationAccess: grant.operationAccess,
    lifecycle: grant.lifecycle,
    generation: grant.generation,
    policyDigest: grant.policyDigest,
    budget: grant.policy.budget,
    rate: grant.policy.rate,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
    expiresAt: grant.expiresAt,
  }
}

export function buildAgentAccessPolicy(input: Readonly<{
  environment: AgentAccessEnvironment
  currency: string
  exponent: number
  maximumSpendPerInvocation: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}>): AgentAccessPolicy {
  const policyNamespace = `${input.environment}:${input.currency}:${input.exponent}`
  return {
    format: AGENT_ACCESS_POLICY_FORMAT,
    operationAccess: 'all_admitted',
    environment: input.environment,
    budget: {
      budgetPolicyRef: `budget:${policyNamespace}`,
      generation: 1,
      currency: input.currency,
      exponent: input.exponent,
      maximumSpendPerInvocation: input.maximumSpendPerInvocation,
      maximumDailySpend: input.maximumDailySpend,
      maximumMonthlySpend: input.maximumMonthlySpend,
      maximumConcurrentInvocations: 1,
    },
    rate: {
      ratePolicyRef: `rate:${input.environment}:operations-invoke`,
      generation: 1,
      maximumCallsPerMinute: 30,
      maximumCallsPerHour: 300,
    },
  }
}

export function evaluateAgentAccessOperation(input: Readonly<{
  grant: AgentAccessGrant
  principal: Readonly<{
    principalId: string
    applicationRef: string
    environment: AgentAccessEnvironment
    grantGeneration?: number
    policyDigest?: string
  }>
  operation: AgentAccessOperationFacts
  now: number
}>): AgentAccessOperationDecision {
  const { grant, principal, operation, now } = input
  if (grant.lifecycle !== 'active') return { kind: 'refused', code: 'grant_not_active' }
  if (grant.expiresAt <= now) return { kind: 'refused', code: 'grant_expired' }
  if (grant.environment === 'production' && grant.authorityMode === 'full_yolo') {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  if (principal.principalId !== grant.principalId) return { kind: 'refused', code: 'grant_principal_mismatch' }
  if (principal.applicationRef !== grant.applicationRef) return { kind: 'refused', code: 'grant_application_mismatch' }
  if (principal.environment !== grant.environment) return { kind: 'refused', code: 'grant_environment_mismatch' }
  if (principal.grantGeneration !== undefined && principal.grantGeneration !== grant.generation) return { kind: 'refused', code: 'grant_generation_stale' }
  if (principal.policyDigest !== undefined && principal.policyDigest !== grant.policyDigest) return { kind: 'refused', code: 'grant_generation_stale' }
  if (operation.spend !== undefined) {
    const comparison = compareExactAmounts(operation.spend, grant.policy.budget.maximumSpendPerInvocation)
    if (comparison === undefined) return { kind: 'refused', code: 'budget_currency_mismatch' }
    if (comparison > 0) return { kind: 'refused', code: 'spend_limit_exceeded' }
  }
  return { kind: 'accepted', grantRef: grant.grantRef, generation: grant.generation }
}
