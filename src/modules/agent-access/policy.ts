import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isPublicToolRef } from '@/modules/common/tool-ref'
import { compareExactAmounts, exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  type AgentAccessAuthorityMode,
} from './contract'

export {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
}
export type { AgentAccessAuthorityMode, AgentAccessEnvironment }

export const LEGACY_AGENT_ACCESS_POLICY_FORMAT = 'ae.agent-access-policy:v1' as const
export const LEGACY_AGENT_ACCESS_GRANT_FORMAT = 'ae.agent-access-grant:v1' as const
export const AGENT_ACCESS_POLICY_FORMAT = 'ae.agent-access-policy:v2' as const
export const AGENT_ACCESS_GRANT_FORMAT = 'ae.agent-access-grant:v2' as const
export const AGENT_ACCESS_ENVIRONMENT_VALUES = ['sandbox', 'production'] as const
export const AGENT_ACCESS_TOOL_ACCESS_VALUES = ['all_admitted', 'selected_tools'] as const
export const AGENT_ACCESS_LIFECYCLE_VALUES = ['active', 'revoked', 'expired'] as const

export type AgentAccessToolAccess = typeof AGENT_ACCESS_TOOL_ACCESS_VALUES[number]
export type AgentAccessLifecycle = typeof AGENT_ACCESS_LIFECYCLE_VALUES[number]
type AgentAccessEnvironment = typeof AGENT_ACCESS_ENVIRONMENT_VALUES[number]
type ProtectedAgentAccessAuthorityMode = 'inspect_only'
  | 'approve_each'
  | 'bounded_mandate'
  | 'full_yolo'

function targetAuthorityMode(mode: ProtectedAgentAccessAuthorityMode): AgentAccessAuthorityMode {
  switch (mode) {
    case 'inspect_only': return 'read_only'
    case 'approve_each': return 'approval_required'
    case 'bounded_mandate': return 'spending_policy'
    case 'full_yolo': return 'unrestricted_test_only'
  }
}

const identifier = z.string().trim().min(1).max(300)
const positiveSafeInteger = z.number().int().safe().positive()
const nonNegativeSafeInteger = z.number().int().safe().nonnegative()
const money = exactAmountSchema
const environment = z.enum(AGENT_ACCESS_ENVIRONMENT_VALUES)
const toolRef = z.string().superRefine((value, context) => {
  if (!isPublicToolRef(value)) context.addIssue({ code: 'custom', message: 'tool_ref_invalid' })
})

const targetBudgetPolicySchema = z.strictObject({
  budgetPolicyRef: identifier,
  generation: positiveSafeInteger,
  currency: identifier,
  exponent: nonNegativeSafeInteger,
  maximumSpendPerCall: money,
  maximumDailySpend: money,
  maximumMonthlySpend: money,
  maximumConcurrentCalls: positiveSafeInteger,
}).superRefine((value, context) => {
  const amounts = [
    value.maximumSpendPerCall,
    value.maximumDailySpend,
    value.maximumMonthlySpend,
  ]
  for (const amount of amounts) {
    if (amount.currency !== value.currency || amount.exponent !== value.exponent) {
      context.addIssue({ code: 'custom', message: 'budget_currency_mismatch', path: ['currency'] })
      break
    }
  }
  if (compareExactAmounts(value.maximumSpendPerCall, value.maximumDailySpend) === 1) {
    context.addIssue({ code: 'custom', message: 'per_call_exceeds_daily', path: ['maximumSpendPerCall'] })
  }
  if (compareExactAmounts(value.maximumDailySpend, value.maximumMonthlySpend) === 1) {
    context.addIssue({ code: 'custom', message: 'daily_exceeds_monthly', path: ['maximumDailySpend'] })
  }
})
export const agentAccessBudgetPolicySchema = targetBudgetPolicySchema
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

const policyFields = {
  environment,
  budget: targetBudgetPolicySchema,
  rate: agentAccessRatePolicySchema,
} as const

/*
 * These schemas describe the historical policy material, not the current
 * source-facing contract. They are intentionally kept at this codec boundary
 * so v1 rows and the v2 digest vectors continue to parse byte-for-byte.
 */
const protectedBudgetPolicySchema = z.strictObject({
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
const protectedPolicyFields = {
  environment,
  budget: protectedBudgetPolicySchema,
  rate: agentAccessRatePolicySchema,
} as const

export const legacyAgentAccessPolicySchema = z.strictObject({
  format: z.literal(LEGACY_AGENT_ACCESS_POLICY_FORMAT),
  operationAccess: z.literal('all_admitted'),
  ...protectedPolicyFields,
})

const protectedV2PolicySchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_POLICY_FORMAT),
  operationAccess: z.literal('all_admitted').or(z.literal('selected_operations')),
  operationRefs: z.array(z.string()),
  ...protectedPolicyFields,
})

const allAdmittedPolicySchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_POLICY_FORMAT),
  toolAccess: z.literal('all_admitted'),
  toolRefs: z.array(toolRef).length(0),
  ...policyFields,
})
const selectedToolsPolicySchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_POLICY_FORMAT),
  toolAccess: z.literal('selected_tools'),
  toolRefs: z.array(toolRef).min(1).max(64).superRefine((refs, context) => {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: 'custom', message: 'tool_refs_duplicate' })
    }
  }),
  ...policyFields,
})

export const agentAccessPolicySchema = z.discriminatedUnion('toolAccess', [
  allAdmittedPolicySchema,
  selectedToolsPolicySchema,
]).transform((policy) => ({ ...policy, toolRefs: [...policy.toolRefs].sort() }))
export type AgentAccessPolicy = z.infer<typeof agentAccessPolicySchema>
export type LegacyAgentAccessPolicy = z.infer<typeof legacyAgentAccessPolicySchema>
export type StoredAgentAccessPolicy = AgentAccessPolicy | LegacyAgentAccessPolicy

function targetPolicyFromProtected(
  policy: z.infer<typeof legacyAgentAccessPolicySchema> | z.infer<typeof protectedV2PolicySchema>,
): AgentAccessPolicy | undefined {
  const operationRefs = 'operationRefs' in policy ? policy.operationRefs : undefined
  if (policy.operationAccess === 'all_admitted') {
    if (operationRefs !== undefined && operationRefs.length !== 0) return undefined
  } else if (operationRefs === undefined || operationRefs.length === 0) {
    return undefined
  }
  const parsed = agentAccessPolicySchema.safeParse({
    format: AGENT_ACCESS_POLICY_FORMAT,
    toolAccess: policy.operationAccess === 'selected_operations' ? 'selected_tools' : 'all_admitted',
    ...(operationRefs === undefined ? { toolRefs: [] as [] } : { toolRefs: operationRefs }),
    environment: policy.environment,
    budget: {
      budgetPolicyRef: policy.budget.budgetPolicyRef,
      generation: policy.budget.generation,
      currency: policy.budget.currency,
      exponent: policy.budget.exponent,
      maximumSpendPerCall: policy.budget.maximumSpendPerInvocation,
      maximumDailySpend: policy.budget.maximumDailySpend,
      maximumMonthlySpend: policy.budget.maximumMonthlySpend,
      maximumConcurrentCalls: policy.budget.maximumConcurrentInvocations,
    },
    rate: policy.rate,
  })
  return parsed.success ? parsed.data : undefined
}

/** Project current target policy fields back to the protected digest material. */
function protectedPolicyMaterial(policy: AgentAccessPolicy): Record<string, unknown> {
  return {
    budget: {
      budgetPolicyRef: policy.budget.budgetPolicyRef,
      currency: policy.budget.currency,
      exponent: policy.budget.exponent,
      generation: policy.budget.generation,
      maximumConcurrentInvocations: policy.budget.maximumConcurrentCalls,
      maximumDailySpend: policy.budget.maximumDailySpend,
      maximumMonthlySpend: policy.budget.maximumMonthlySpend,
      maximumSpendPerInvocation: policy.budget.maximumSpendPerCall,
    },
    environment: policy.environment,
    format: policy.format,
    operationAccess: policy.toolAccess === 'selected_tools' ? 'selected_operations' : 'all_admitted',
    operationRefs: policy.toolAccess === 'selected_tools' ? [...policy.toolRefs] : [],
    rate: {
      generation: policy.rate.generation,
      maximumCallsPerHour: policy.rate.maximumCallsPerHour,
      maximumCallsPerMinute: policy.rate.maximumCallsPerMinute,
      ratePolicyRef: policy.rate.ratePolicyRef,
    },
  }
}

export type AgentAccessGrant = Readonly<{
  format: typeof AGENT_ACCESS_GRANT_FORMAT
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessEnvironment
  toolAccess: AgentAccessToolAccess
  toolRefs: string[]
  authorityMode: AgentAccessAuthorityMode
  spendingPolicy: AgentAccessPolicy
  budgetPolicyRef: string
  ratePolicyRef: string
  lifecycle: AgentAccessLifecycle
  generation: number
  spendingPolicyDigest: string
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
  toolAccess: AgentAccessToolAccess
  toolRefs: string[]
  lifecycle: AgentAccessLifecycle
  generation: number
  spendingPolicyDigest: string
  budget: AgentAccessBudgetPolicy
  rate: AgentAccessRatePolicy
  createdAt: number
  updatedAt: number
  expiresAt: number
}>
export type AgentAccessOwnerGrantReadback = Readonly<{
  principalId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  authorityMode: AgentAccessAuthorityMode
  toolAccess: AgentAccessToolAccess
  toolRefs: readonly string[]
  lifecycle: AgentAccessLifecycle
  expiresAt: number
  budget: Readonly<{
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
    maximumConcurrentCalls: number
  }>
  rate: Readonly<{
    maximumCallsPerMinute: number
    maximumCallsPerHour: number
  }>
}>

export type AgentAccessGrantInput = Readonly<Omit<AgentAccessGrant, 'format' | 'toolRefs' | 'spendingPolicyDigest' | 'budgetPolicyRef' | 'ratePolicyRef'> & {
  spendingPolicy: StoredAgentAccessPolicy
  toolRefs?: readonly string[]
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
  | 'tool_not_allowed'
  | 'spend_limit_exceeded'
  | 'budget_currency_mismatch'

export type AgentAccessPolicyDecision =
  | Readonly<{ kind: 'accepted'; grant: AgentAccessGrant }>
  | Readonly<{ kind: 'refused'; code: AgentAccessPolicyRefusalCode }>

export type AgentAccessToolFacts = Readonly<{
  toolRef: string
  spend?: ExactAmount
}>

export type AgentAccessToolDecision =
  | Readonly<{ kind: 'accepted'; grantRef: string; generation: number }>
  | Readonly<{ kind: 'refused'; code: AgentAccessPolicyRefusalCode }>

export function agentAccessPolicyDigest(policy: AgentAccessPolicy | LegacyAgentAccessPolicy): string {
  return policy.format === LEGACY_AGENT_ACCESS_POLICY_FORMAT
    ? canonicalDigest(policy as never)
    : canonicalDigest(protectedPolicyMaterial(policy) as never)
}

export function normalizeStoredAgentAccessPolicy(policy: StoredAgentAccessPolicy): AgentAccessPolicy | undefined {
  const candidate: unknown = policy
  if (typeof candidate !== 'object' || candidate === null || !('format' in candidate)
    || typeof candidate.format !== 'string') return undefined
  if (candidate.format === AGENT_ACCESS_POLICY_FORMAT) {
    const parsedTarget = agentAccessPolicySchema.safeParse(candidate)
    if (parsedTarget.success) return parsedTarget.data
    const parsedProtected = protectedV2PolicySchema.safeParse(candidate)
    return parsedProtected.success ? targetPolicyFromProtected(parsedProtected.data) : undefined
  }
  const legacy = legacyAgentAccessPolicySchema.safeParse(candidate)
  return legacy.success ? targetPolicyFromProtected(legacy.data) : undefined
}

export function normalizeAgentAccessToolSelection(input: Readonly<{
  toolAccess: AgentAccessToolAccess
  toolRefs?: readonly string[]
}>): Readonly<{ toolAccess: AgentAccessToolAccess; toolRefs: string[] }> | undefined {
  const toolRefs = input.toolRefs ?? []
  if (input.toolAccess === 'all_admitted') {
    return toolRefs.length === 0 ? { toolAccess: input.toolAccess, toolRefs: [] } : undefined
  }
  if (toolRefs.length < 1 || toolRefs.length > 64
    || new Set(toolRefs).size !== toolRefs.length
    || toolRefs.some((ref) => !isPublicToolRef(ref))) return undefined
  return { toolAccess: input.toolAccess, toolRefs: [...toolRefs].sort() }
}

export function agentAccessGrantAllowsTool(
  grant: Readonly<{ toolAccess: AgentAccessToolAccess; toolRefs: readonly string[] }>,
  toolRef: string,
): boolean {
  if (!isPublicToolRef(toolRef)) return false
  return grant.toolAccess === 'all_admitted' || grant.toolRefs.includes(toolRef)
}

type AgentAccessGrantBase = Omit<AgentAccessGrant, 'format' | 'toolRefs' | 'spendingPolicyDigest' | 'spendingPolicy'>
export type LegacyAgentAccessGrant = Readonly<AgentAccessGrantBase & {
  format: typeof LEGACY_AGENT_ACCESS_GRANT_FORMAT
  toolAccess: 'all_admitted'
  toolRefs: []
  spendingPolicy: LegacyAgentAccessPolicy
  spendingPolicyDigest: string
}>
export type StoredAgentAccessGrant = AgentAccessGrant | LegacyAgentAccessGrant
export type NormalizedLegacyAgentAccessGrant = LegacyAgentAccessGrant
export type NormalizedStoredAgentAccessGrant = AgentAccessGrant | NormalizedLegacyAgentAccessGrant

const storedGrantFields = {
  grantRef: identifier,
  principalId: identifier,
  ownerId: identifier,
  applicationRef: identifier,
  credentialId: identifier,
  environment,
  budgetPolicyRef: identifier,
  ratePolicyRef: identifier,
  lifecycle: z.enum(AGENT_ACCESS_LIFECYCLE_VALUES),
  generation: positiveSafeInteger,
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  expiresAt: z.number().finite(),
} as const

const protectedGrantFields = {
  ...storedGrantFields,
  authorityMode: z.enum(['inspect_only', 'approve_each', 'bounded_mandate', 'full_yolo'] as const),
  policyDigest: identifier,
} as const
const targetGrantFields = {
  ...storedGrantFields,
  authorityMode: z.enum(AGENT_ACCESS_AUTHORITY_MODE_VALUES),
  spendingPolicyDigest: identifier,
} as const

const protectedLegacyAgentAccessGrantSchema = z.strictObject({
  format: z.literal(LEGACY_AGENT_ACCESS_GRANT_FORMAT),
  ...protectedGrantFields,
  operationAccess: z.literal('all_admitted'),
  policy: legacyAgentAccessPolicySchema,
})
const protectedV2AgentAccessGrantSchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_GRANT_FORMAT),
  ...protectedGrantFields,
  operationAccess: z.literal('all_admitted').or(z.literal('selected_operations')),
  operationRefs: z.array(z.string()),
  policy: protectedV2PolicySchema,
})
export const legacyAgentAccessGrantSchema = protectedLegacyAgentAccessGrantSchema
export const v2AgentAccessGrantSchema = z.strictObject({
  format: z.literal(AGENT_ACCESS_GRANT_FORMAT),
  ...targetGrantFields,
  toolAccess: z.enum(AGENT_ACCESS_TOOL_ACCESS_VALUES),
  toolRefs: z.array(toolRef),
  spendingPolicy: agentAccessPolicySchema,
})
export const storedAgentAccessGrantSchema = z.union([
  protectedLegacyAgentAccessGrantSchema,
  protectedV2AgentAccessGrantSchema,
  v2AgentAccessGrantSchema,
])

function targetGrantFromProtected(
  grant: z.infer<typeof protectedLegacyAgentAccessGrantSchema> | z.infer<typeof protectedV2AgentAccessGrantSchema>,
): NormalizedStoredAgentAccessGrant | undefined {
  const authorityMode = targetAuthorityMode(grant.authorityMode)
  if (authorityMode === undefined) return undefined
  const common = {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    authorityMode,
    budgetPolicyRef: grant.budgetPolicyRef,
    ratePolicyRef: grant.ratePolicyRef,
    lifecycle: grant.lifecycle,
    generation: grant.generation,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
    expiresAt: grant.expiresAt,
  }
  if (grant.format === LEGACY_AGENT_ACCESS_GRANT_FORMAT) {
    return Object.freeze({
      ...common,
      format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
      toolAccess: 'all_admitted',
      toolRefs: [] as [],
      spendingPolicy: grant.policy,
      spendingPolicyDigest: grant.policyDigest,
    })
  }
  const policy = targetPolicyFromProtected(grant.policy)
  if (policy === undefined) return undefined
  const toolAccess = grant.operationAccess === 'selected_operations' ? 'selected_tools' : 'all_admitted'
  const selection = normalizeAgentAccessToolSelection({
    toolAccess,
    toolRefs: grant.operationRefs,
  })
  if (selection === undefined
    || selection.toolAccess !== policy.toolAccess
    || selection.toolRefs.length !== policy.toolRefs.length
    || selection.toolRefs.some((ref, index) => ref !== policy.toolRefs[index])) return undefined
  return Object.freeze({
    ...common,
    format: AGENT_ACCESS_GRANT_FORMAT,
    toolAccess: selection.toolAccess,
    toolRefs: selection.toolRefs,
    spendingPolicy: policy,
    spendingPolicyDigest: grant.policyDigest,
  })
}

export function normalizeStoredAgentAccessGrant(input: unknown): NormalizedStoredAgentAccessGrant {
  let material = input
  if (typeof input === 'object' && input !== null
    && '_id' in input && typeof input._id === 'string'
    && '_creationTime' in input && typeof input._creationTime === 'number') {
    const { _id, _creationTime, ...storedMaterial } = input
    void _id
    void _creationTime
    material = storedMaterial
  }
  const stored = storedAgentAccessGrantSchema.safeParse(material)
  if (!stored.success) throw new Error('stored_agent_access_grant_invalid')
  const grant = stored.data
  if ('spendingPolicy' in grant) {
    const policy = agentAccessPolicySchema.safeParse(grant.spendingPolicy)
    const selection = normalizeAgentAccessToolSelection(grant)
    if (!policy.success || selection === undefined
      || selection.toolAccess !== policy.data.toolAccess
      || selection.toolRefs.length !== policy.data.toolRefs.length
      || selection.toolRefs.some((ref, index) => ref !== policy.data.toolRefs[index])
      || agentAccessPolicyDigest(policy.data) !== grant.spendingPolicyDigest) {
      throw new Error('stored_agent_access_grant_invalid')
    }
    return Object.freeze({
      ...grant,
      format: AGENT_ACCESS_GRANT_FORMAT,
      toolAccess: selection.toolAccess,
      toolRefs: selection.toolRefs,
      spendingPolicy: policy.data,
    })
  }
  const normalized = targetGrantFromProtected(grant)
  if (normalized === undefined) {
    throw new Error('stored_agent_access_grant_invalid')
  }
  if (grant.format === LEGACY_AGENT_ACCESS_GRANT_FORMAT) {
    if (agentAccessPolicyDigest(grant.policy) !== grant.policyDigest) {
      throw new Error('stored_agent_access_grant_invalid')
    }
    return Object.freeze({ ...normalized, spendingPolicyDigest: grant.policyDigest })
  }
  if (agentAccessPolicyDigest(normalized.spendingPolicy) !== grant.policyDigest) {
    throw new Error('stored_agent_access_grant_invalid')
  }
  return Object.freeze({ ...normalized, spendingPolicyDigest: grant.policyDigest })
}

export function normalizeStoredAgentAccessGrantForTool(
  input: unknown,
  toolRef: string,
): NormalizedStoredAgentAccessGrant | undefined {
  try {
    const grant = normalizeStoredAgentAccessGrant(input)
    return agentAccessGrantAllowsTool(grant, toolRef) ? grant : undefined
  } catch {
    return undefined
  }
}

export function createAgentAccessGrant(input: AgentAccessGrantInput): AgentAccessPolicyDecision {
  const spendingPolicy = normalizeStoredAgentAccessPolicy(input.spendingPolicy)
  if (spendingPolicy === undefined) return { kind: 'refused', code: 'grant_material_invalid' }
  const selection = normalizeAgentAccessToolSelection(input)
  if (selection === undefined
    || selection.toolAccess !== spendingPolicy.toolAccess
    || selection.toolRefs.length !== spendingPolicy.toolRefs.length
    || selection.toolRefs.some((ref, index) => ref !== spendingPolicy.toolRefs[index])) {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  if (spendingPolicy.environment !== input.environment) return { kind: 'refused', code: 'grant_environment_mismatch' }
  if (input.environment === 'production' && input.authorityMode === 'unrestricted_test_only') {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  if (!Number.isSafeInteger(input.generation) || input.generation < 1 || !Number.isFinite(input.createdAt)
    || !Number.isFinite(input.updatedAt) || !Number.isFinite(input.expiresAt) || input.expiresAt <= input.createdAt) {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  const budgetPolicyRef = input.budgetPolicyRef ?? spendingPolicy.budget.budgetPolicyRef
  const ratePolicyRef = input.ratePolicyRef ?? spendingPolicy.rate.ratePolicyRef
  const spendingPolicyDigest = agentAccessPolicyDigest(spendingPolicy)
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
      toolAccess: selection.toolAccess,
      toolRefs: selection.toolRefs,
      authorityMode: input.authorityMode,
      spendingPolicy,
      budgetPolicyRef,
      ratePolicyRef,
      lifecycle: input.lifecycle,
      generation: input.generation,
      spendingPolicyDigest,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      expiresAt: input.expiresAt,
    }),
  }
}

export function projectAgentAccessGrant(grant: NormalizedStoredAgentAccessGrant): AgentAccessGrantReadback {
  const spendingPolicy = grant.format === LEGACY_AGENT_ACCESS_GRANT_FORMAT
    ? normalizeStoredAgentAccessPolicy(grant.spendingPolicy)
    : grant.spendingPolicy
  if (spendingPolicy === undefined) throw new Error('stored_agent_access_grant_invalid')
  return {
    grantRef: grant.grantRef,
    principalId: grant.principalId,
    ownerId: grant.ownerId,
    applicationRef: grant.applicationRef,
    credentialId: grant.credentialId,
    environment: grant.environment,
    authorityMode: grant.authorityMode,
    toolAccess: grant.toolAccess,
    toolRefs: grant.toolRefs,
    lifecycle: grant.lifecycle,
    generation: grant.generation,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    budget: spendingPolicy.budget,
    rate: spendingPolicy.rate,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
    expiresAt: grant.expiresAt,
  }
}

export function buildAgentAccessPolicy(input: Readonly<{
  environment: AgentAccessEnvironment
  currency: string
  exponent: number
  maximumSpendPerCall: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
  toolAccess?: AgentAccessToolAccess
  toolRefs?: readonly string[]
}>): AgentAccessPolicy {
  const selection = normalizeAgentAccessToolSelection({
    toolAccess: input.toolAccess ?? 'all_admitted',
    ...(input.toolRefs === undefined ? {} : { toolRefs: input.toolRefs }),
  })
  if (selection === undefined) throw new Error('agent_access_tool_selection_invalid')
  const policyNamespace = `${input.environment}:${input.currency}:${input.exponent}`
  return {
    format: AGENT_ACCESS_POLICY_FORMAT,
    toolAccess: selection.toolAccess,
    toolRefs: selection.toolRefs,
    environment: input.environment,
    budget: {
      budgetPolicyRef: `budget:${policyNamespace}`,
      generation: 1,
      currency: input.currency,
      exponent: input.exponent,
      maximumSpendPerCall: input.maximumSpendPerCall,
      maximumDailySpend: input.maximumDailySpend,
      maximumMonthlySpend: input.maximumMonthlySpend,
      maximumConcurrentCalls: 1,
    },
    rate: {
      // This namespace is part of the protected policy digest material. Keep
      // its historical operation-invoke label at this source boundary.
      ratePolicyRef: `rate:${input.environment}:operations-invoke`,
      generation: 1,
      maximumCallsPerMinute: 30,
      maximumCallsPerHour: 300,
    },
  }
}

export function evaluateAgentAccessTool(input: Readonly<{
  grant: NormalizedStoredAgentAccessGrant
  principal: Readonly<{
    principalId: string
    applicationRef: string
    environment: AgentAccessEnvironment
    grantGeneration?: number
    spendingPolicyDigest?: string
  }>
  tool: AgentAccessToolFacts
  now: number
}>): AgentAccessToolDecision {
  const { grant, principal, tool, now } = input
  if (grant.lifecycle !== 'active') return { kind: 'refused', code: 'grant_not_active' }
  if (grant.expiresAt <= now) return { kind: 'refused', code: 'grant_expired' }
  if (grant.environment === 'production' && grant.authorityMode === 'unrestricted_test_only') {
    return { kind: 'refused', code: 'grant_material_invalid' }
  }
  if (principal.principalId !== grant.principalId) return { kind: 'refused', code: 'grant_principal_mismatch' }
  if (principal.applicationRef !== grant.applicationRef) return { kind: 'refused', code: 'grant_application_mismatch' }
  if (principal.environment !== grant.environment) return { kind: 'refused', code: 'grant_environment_mismatch' }
  if (principal.grantGeneration !== undefined && principal.grantGeneration !== grant.generation) return { kind: 'refused', code: 'grant_generation_stale' }
  if (principal.spendingPolicyDigest !== undefined && principal.spendingPolicyDigest !== grant.spendingPolicyDigest) return { kind: 'refused', code: 'grant_generation_stale' }
  if (tool.spend !== undefined) {
    const spendingPolicy = grant.format === LEGACY_AGENT_ACCESS_GRANT_FORMAT
      ? normalizeStoredAgentAccessPolicy(grant.spendingPolicy)
      : grant.spendingPolicy
    if (spendingPolicy === undefined) return { kind: 'refused', code: 'grant_material_invalid' }
    const comparison = compareExactAmounts(tool.spend, spendingPolicy.budget.maximumSpendPerCall)
    if (comparison === undefined) return { kind: 'refused', code: 'budget_currency_mismatch' }
    if (comparison > 0) return { kind: 'refused', code: 'spend_limit_exceeded' }
  }
  return { kind: 'accepted', grantRef: grant.grantRef, generation: grant.generation }
}
