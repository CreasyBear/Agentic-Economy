import { degradeBackend } from '@/lib/observability/degrade-backend'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  createAgentAccessGrant,
  agentAccessPolicyDigest,
  normalizeStoredAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessPolicy,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'

import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
} from './constants'

export const SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF =
  'agent-access-grant:platform:seller-onboarding-canary:sandbox:v1' as const
export const SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF =
  'agentic-economy:seller-onboarding-canary' as const
export const SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID =
  'prn_00000000000000000000000000000402' as const
export const SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID =
  'acc_00000000000000000000000000000402' as const
export const SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID =
  'ae-cdp-seller-onboarding-canary-sandbox-v1' as const
export const SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF =
  'budget:platform:seller-onboarding-canary:sandbox:v1' as const
export const SELLER_ONBOARDING_CANARY_RATE_POLICY_REF =
  'rate:platform:seller-onboarding-canary:sandbox:v1' as const
export const SELLER_ONBOARDING_CANARY_GRANT_GENERATION = 1 as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF =
  'agentic-economy:seller-onboarding-canary:production' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID =
  'prn_00000000000000000000000000008453' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID =
  'acc_00000000000000000000000000008453' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID =
  'ae-cdp-seller-onboarding-canary-production-v1' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF =
  'budget:platform:seller-onboarding-canary:production:v1' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF =
  'rate:platform:seller-onboarding-canary:production:v1' as const

export const PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS = 7 * 24 * 60 * 60_000
export const SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT = 4_102_444_800_000

export type ReadinessCode =
  | 'canary_grant_missing'
  | 'canary_grant_ambiguous'
  | 'canary_grant_stale'
  | 'canary_grant_material_invalid'
  | 'canary_principal_missing'
  | 'canary_principal_stale'
  | 'canary_credential_conflict'
  | 'canary_policy_stale'
  | 'cdp_custody_configuration_missing'
  | 'cdp_custody_cap_mismatch'
  | 'x402_sandbox_profile_invalid'
  | 'x402_sandbox_rpc_configuration_missing'
  | 'x402_production_profile_invalid'
  | 'x402_production_rpc_configuration_missing'

export type SellerOnboardingCanaryPlatformGrantExpectation = Readonly<{
  sellerOwnerId: string
  expected: Readonly<{ kind: 'current_platform_grant'; environment: 'sandbox' | 'production' }> | Readonly<{
    kind: 'persisted_dispatch'
    grantRef: string
    principalId: string
    ownerId: string
    credentialId: string
    applicationRef: string
    environment: 'sandbox' | 'production'
    generation: number
    spendingPolicyDigest: string
    expiresAt: number
  }>
  now: number
}>

export function canaryPolicy(
  environment: 'sandbox' | 'production' = 'sandbox',
  generation: number = SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
): AgentAccessPolicy {
  const amount = (units: string) => ({ currency: 'USD', units, exponent: 6 })
  const production = environment === 'production'
  return {
    format: 'ae.agent-access-policy:v2',
    toolAccess: 'all_admitted',
    toolRefs: [],
    environment,
    budget: {
      budgetPolicyRef: production ? PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF : SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
      generation,
      currency: 'USD',
      exponent: 6,
      maximumSpendPerCall: amount(production ? PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC : SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC),
      maximumDailySpend: amount(production ? PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC : SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC),
      maximumMonthlySpend: amount(production ? PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC : SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC),
      maximumConcurrentCalls: 1,
    },
    rate: {
      ratePolicyRef: production ? PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF : SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
      generation,
      maximumCallsPerMinute: 1,
      maximumCallsPerHour: 5,
    },
  }
}

export function expectedCanaryGrant(now: number): AgentAccessGrant {
  const decision = createAgentAccessGrant({
    grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
    principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
    ownerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
    applicationRef: SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
    credentialId: SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
    environment: 'sandbox',
    toolAccess: 'all_admitted',
    authorityMode: 'unrestricted_test_only',
    spendingPolicy: canaryPolicy(),
    lifecycle: 'active',
    generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
    createdAt: now,
    updatedAt: now,
    expiresAt: SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT,
  })
  if (decision.kind !== 'accepted') {
    throw new Error(`seller_onboarding_canary_policy_invalid:${decision.code}`)
  }
  return decision.grant
}

export function productionGrantRef(generation: number): string {
  return `agent-access-grant:platform:seller-onboarding-canary:production:v${generation}`
}

export function expectedProductionCanaryGrant(
  generation: number,
  issuedAt: number,
  expiresAt: number,
): AgentAccessGrant {
  const decision = createAgentAccessGrant({
    grantRef: productionGrantRef(generation),
    principalId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
    ownerId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
    applicationRef: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
    credentialId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
    environment: 'production',
    toolAccess: 'all_admitted',
    authorityMode: 'spending_policy',
    spendingPolicy: canaryPolicy('production', generation),
    lifecycle: 'active',
    generation,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    expiresAt,
  })
  if (decision.kind !== 'accepted') throw new Error(`production_seller_canary_policy_invalid:${decision.code}`)
  return decision.grant
}

export function sellerOnboardingCanaryPlatformGrantExpectation(
  sellerOwnerId: string,
  now: number,
  environment: 'sandbox' | 'production' = 'sandbox',
): SellerOnboardingCanaryPlatformGrantExpectation {
  return {
    sellerOwnerId,
    expected: { kind: 'current_platform_grant', environment },
    now,
  }
}

export function grantReadinessCodes(
  storedGrant: unknown,
  expected: AgentAccessGrant,
  now: number,
): ReadinessCode[] {
  let grant: NormalizedStoredAgentAccessGrant
  try {
    grant = normalizeStoredAgentAccessGrant(storedGrant)
  } catch (cause) {
    return degradeBackend(cause, ['canary_grant_material_invalid'], { site: 'grantReadinessCodes', reason: 'invalid_response' })
  }
  const codes: ReadinessCode[] = []
  if (
    grant.format !== 'ae.agent-access-grant:v2'
    || grant.grantRef !== expected.grantRef
    || grant.principalId !== expected.principalId
    || grant.ownerId !== expected.ownerId
    || grant.applicationRef !== expected.applicationRef
    || grant.credentialId !== expected.credentialId
    || grant.environment !== 'sandbox'
    || grant.toolAccess !== 'all_admitted'
    || grant.toolRefs.length !== 0
    || grant.authorityMode !== 'unrestricted_test_only'
    || grant.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    || grant.expiresAt !== SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT
  ) codes.push('canary_grant_material_invalid')
  if (grant.lifecycle !== 'active' || grant.expiresAt <= now) {
    codes.push('canary_grant_stale')
  }
  if (
    grant.spendingPolicyDigest !== expected.spendingPolicyDigest
    || agentAccessPolicyDigest(grant.spendingPolicy) !== expected.spendingPolicyDigest
    || grant.budgetPolicyRef !== SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF
    || grant.ratePolicyRef !== SELLER_ONBOARDING_CANARY_RATE_POLICY_REF
    || grant.spendingPolicy.budget.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    || grant.spendingPolicy.rate.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
  ) codes.push('canary_policy_stale')
  return codes
}

export function principalReadinessCodes(
  principal: Readonly<{
    ownerId: string
    credentialId: string
    applicationRef: string
    environment: 'sandbox' | 'production'
    scopes: readonly string[]
    authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
    grantGeneration: number
    spendingPolicyDigest: string
    lifecycle: 'active' | 'revoked' | 'expired'
    expiresAt?: number
  }>,
  expected: AgentAccessGrant,
  now: number,
): ReadinessCode[] {
  return principal.ownerId === SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID
    && principal.credentialId === SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID
    && principal.applicationRef === SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
    && principal.environment === 'sandbox'
    && principal.scopes.length === 1
    && principal.scopes[0] === MARKET_TOOLS_CALL_SCOPE
    && principal.authorityMode === 'unrestricted_test_only'
    && principal.grantGeneration === SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    && principal.spendingPolicyDigest === expected.spendingPolicyDigest
    && principal.lifecycle === 'active'
    && principal.expiresAt === SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT
    && principal.expiresAt > now
    ? []
    : ['canary_principal_stale']
}

export function exactProductionGrantMaterial(
  stored: unknown,
  expected: AgentAccessGrant,
): boolean {
  try {
    const grant = normalizeStoredAgentAccessGrant(stored)
    return grant.format === expected.format
      && grant.grantRef === expected.grantRef
      && grant.principalId === expected.principalId
      && grant.ownerId === expected.ownerId
      && grant.applicationRef === expected.applicationRef
      && grant.credentialId === expected.credentialId
      && grant.environment === expected.environment
      && grant.authorityMode === expected.authorityMode
      && grant.toolAccess === expected.toolAccess
      && grant.toolRefs.length === 0
      && grant.lifecycle === 'active'
      && grant.generation === expected.generation
      && grant.spendingPolicyDigest === expected.spendingPolicyDigest
      && grant.budgetPolicyRef === expected.budgetPolicyRef
      && grant.ratePolicyRef === expected.ratePolicyRef
      && grant.createdAt === expected.createdAt
      && grant.updatedAt === expected.updatedAt
      && grant.expiresAt === expected.expiresAt
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'exactProductionGrantMaterial', reason: 'invalid_response' })
  }
}
