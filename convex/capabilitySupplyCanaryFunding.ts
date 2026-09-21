import { v } from 'convex/values'

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
import { agentAccessGrantValue } from '@/modules/agent-access/public'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  cdpX402CustodyConfigurationFromEnvironment,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
} from '@/modules/capability-supply/public'

import { env, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
} from './lib/capabilitySupply/canaryFundingConstants'

export type {
  SellerOnboardingCanaryCdpPreflightCode,
  SellerOnboardingCanaryCdpPreflightResult,
} from './capabilitySupplyCanaryFundingPreflight'

export const SELLER_ONBOARDING_CANARY_CDP_PREFLIGHT_ACTION =
  'capabilitySupplyCanaryFundingPreflight:readSellerOnboardingCanaryCdpReadiness' as const

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
export const PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC = '10000' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC = '50000' as const
export const PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC = '50000' as const
const PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS = 7 * 24 * 60 * 60_000

export {
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
}

const SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT = 4_102_444_800_000
const MAX_X402_RPC_CONFIG_LENGTH = 16_384

const readinessCode = v.union(
  v.literal('canary_grant_missing'),
  v.literal('canary_grant_ambiguous'),
  v.literal('canary_grant_stale'),
  v.literal('canary_grant_material_invalid'),
  v.literal('canary_principal_missing'),
  v.literal('canary_principal_stale'),
  v.literal('canary_credential_conflict'),
  v.literal('canary_policy_stale'),
  v.literal('cdp_custody_configuration_missing'),
  v.literal('cdp_custody_cap_mismatch'),
  v.literal('x402_sandbox_profile_invalid'),
  v.literal('x402_sandbox_rpc_configuration_missing'),
  v.literal('x402_production_profile_invalid'),
  v.literal('x402_production_rpc_configuration_missing'),
)

const provisionResult = v.union(
  v.object({
    kind: v.literal('ensured'),
    created: v.array(v.union(v.literal('principal'), v.literal('grant'))),
    grantRef: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF),
    principalId: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID),
    generation: v.literal(SELLER_ONBOARDING_CANARY_GRANT_GENERATION),
    spendingPolicyDigest: v.string(),
    budgetPolicyRef: v.literal(SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF),
  }),
  v.object({
    kind: v.literal('conflict'),
    codes: v.array(readinessCode),
  }),
)

const readinessResult = v.union(
  v.object({
    kind: v.literal('ready'),
    grantRef: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF),
    principalId: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID),
    generation: v.literal(SELLER_ONBOARDING_CANARY_GRANT_GENERATION),
    spendingPolicyDigest: v.string(),
    budgetPolicyRef: v.literal(SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF),
    paymentProfile: v.literal('base-sepolia-usdc-exact'),
    network: v.literal(BASE_SEPOLIA_NETWORK),
    asset: v.literal(BASE_SEPOLIA_USDC_ADDRESS),
    rpcEndpointCount: v.number(),
    custodyCredentialGeneration: v.number(),
    custodyPolicyRulesDigest: v.string(),
    checkedAt: v.number(),
  }),
  v.object({
    kind: v.literal('not_ready'),
    codes: v.array(readinessCode),
    checkedAt: v.number(),
  }),
)

const productionProvisionResult = v.union(
  v.object({
    kind: v.union(v.literal('ensured'), v.literal('replayed')),
    grantRef: v.string(),
    principalId: v.literal(PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    expiresAt: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'),
    code: v.union(
      v.literal('issuance_invalid'),
      v.literal('generation_gap'),
      v.literal('material_conflict'),
      v.literal('active_grant_ambiguous'),
      v.literal('principal_conflict'),
    ),
  }),
)

const productionReadinessResult = v.union(
  v.object({
    kind: v.literal('ready'),
    grantRef: v.string(),
    principalId: v.literal(PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    budgetPolicyRef: v.literal(PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF),
    paymentProfile: v.literal('base-usdc-exact'),
    network: v.literal(BASE_MAINNET_NETWORK),
    asset: v.literal(BASE_MAINNET_USDC_ADDRESS),
    rpcEndpointCount: v.number(),
    custodyCredentialGeneration: v.number(),
    custodyPolicyRulesDigest: v.string(),
    checkedAt: v.number(),
  }),
  v.object({ kind: v.literal('not_ready'), codes: v.array(readinessCode), checkedAt: v.number() }),
)

const exactPlatformGrantArgs = {
  sellerOwnerId: v.string(),
  expected: v.union(
    v.object({
      kind: v.literal('current_platform_grant'),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
    }),
    v.object({
      kind: v.literal('persisted_dispatch'),
      grantRef: v.string(),
      principalId: v.string(),
      ownerId: v.string(),
      credentialId: v.string(),
      applicationRef: v.string(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      generation: v.number(),
      spendingPolicyDigest: v.string(),
      expiresAt: v.number(),
    }),
  ),
  now: v.number(),
} as const

const exactPlatformGrantResult = v.union(agentAccessGrantValue, v.null())

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

type ReadinessCode =
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

function canaryPolicy(
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

function expectedCanaryGrant(now: number): AgentAccessGrant {
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

function productionGrantRef(generation: number): string {
  return `agent-access-grant:platform:seller-onboarding-canary:production:v${generation}`
}

function expectedProductionCanaryGrant(
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

function grantReadinessCodes(
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

function principalReadinessCodes(
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

/**
 * Exact platform-grant reader shared by seller-canary admission and execution.
 *
 * The canary lane has one fixed grant identity, so a credential-scoped bounded
 * scan is both weaker and capable of missing the sealed grant when other active
 * rows exist. Read the unique grant reference, then require the complete
 * persisted expectation and its paired platform principal.
 */
export async function readExactSellerOnboardingCanaryPlatformGrantHandler(
  ctx: Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>,
  args: SellerOnboardingCanaryPlatformGrantExpectation,
): Promise<AgentAccessGrant | null> {
  if (!Number.isSafeInteger(args.now) || args.now < 0) return null
  const expectedEnvironment = args.expected.environment
  if (expectedEnvironment === 'production') {
    if (args.sellerOwnerId === PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID) return null
    const persistedGrantRef = args.expected.kind === 'persisted_dispatch'
      ? args.expected.grantRef
      : undefined
    const rows = persistedGrantRef !== undefined
      ? await ctx.db.query('agentAccessGrants')
          .withIndex('by_grantRef', (query) => query.eq('grantRef', persistedGrantRef))
          .take(2)
      : await ctx.db.query('agentAccessGrants')
          .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
            .eq('credentialId', PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID)
            .eq('environment', 'production')
            .eq('lifecycle', 'active'))
          .take(2)
    if (rows.length !== 1) return null
    let normalized: NormalizedStoredAgentAccessGrant
    try {
      normalized = normalizeStoredAgentAccessGrant(rows[0])
    } catch (cause) {
      return degradeBackend(cause, null, { site: 'readExactSellerOnboardingCanaryPlatformGrantHandler.production', reason: 'invalid_response' })
    }
    const expectedPolicy = canaryPolicy('production', normalized.generation)
    if (
      normalized.format !== 'ae.agent-access-grant:v2'
      || normalized.principalId !== PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID
      || normalized.ownerId !== PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID
      || normalized.credentialId !== PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID
      || normalized.applicationRef !== PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
      || normalized.environment !== 'production'
      || normalized.lifecycle !== 'active'
      || normalized.expiresAt <= args.now
      || normalized.authorityMode !== 'spending_policy'
      || normalized.toolAccess !== 'all_admitted'
      || normalized.toolRefs.length !== 0
      || normalized.budgetPolicyRef !== PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF
      || normalized.ratePolicyRef !== PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF
      || normalized.grantRef !== productionGrantRef(normalized.generation)
      || normalized.expiresAt - normalized.createdAt > PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS
      || normalized.createdAt > args.now
      || agentAccessPolicyDigest(normalized.spendingPolicy) !== normalized.spendingPolicyDigest
      || normalized.spendingPolicyDigest !== agentAccessPolicyDigest(expectedPolicy)
    ) return null
    if (args.expected.kind === 'persisted_dispatch' && (
      normalized.grantRef !== args.expected.grantRef
      || normalized.principalId !== args.expected.principalId
      || normalized.ownerId !== args.expected.ownerId
      || normalized.credentialId !== args.expected.credentialId
      || normalized.applicationRef !== args.expected.applicationRef
      || normalized.generation !== args.expected.generation
      || normalized.spendingPolicyDigest !== args.expected.spendingPolicyDigest
      || normalized.expiresAt !== args.expected.expiresAt
    )) return null
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', normalized.principalId))
      .unique()
    if (principal === null
      || principal.ownerId !== normalized.ownerId
      || principal.credentialId !== normalized.credentialId
      || principal.applicationRef !== normalized.applicationRef
      || principal.environment !== 'production'
      || principal.authorityMode !== 'spending_policy'
      || principal.lifecycle !== 'active'
      || principal.grantGeneration !== normalized.generation
      || principal.spendingPolicyDigest !== normalized.spendingPolicyDigest
      || principal.expiresAt !== normalized.expiresAt
      || principal.expiresAt <= args.now
      || principal.scopes.length !== 1
      || principal.scopes[0] !== MARKET_TOOLS_CALL_SCOPE) return null
    return normalized
  }
  if (args.sellerOwnerId === SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID) return null

  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
    .unique()
  if (grant === null) return null
  let normalized: NormalizedStoredAgentAccessGrant
  try {
    normalized = normalizeStoredAgentAccessGrant(grant)
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'readExactSellerOnboardingCanaryPlatformGrantHandler', reason: 'invalid_response' })
  }
  if (
    normalized.format !== 'ae.agent-access-grant:v2'
    || normalized.principalId !== SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID
    || normalized.ownerId !== SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID
    || normalized.credentialId !== SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID
    || normalized.applicationRef !== SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
    || normalized.environment !== 'sandbox'
    || normalized.lifecycle !== 'active'
    || normalized.expiresAt <= args.now
    || normalized.authorityMode !== 'unrestricted_test_only'
    || normalized.toolAccess !== 'all_admitted'
    || normalized.toolRefs.length !== 0
    || normalized.spendingPolicy.environment !== 'sandbox'
    || normalized.spendingPolicy.toolAccess !== 'all_admitted'
    || normalized.spendingPolicy.toolRefs.length !== 0
    || normalized.budgetPolicyRef !== SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF
    || normalized.ratePolicyRef !== SELLER_ONBOARDING_CANARY_RATE_POLICY_REF
    || normalized.spendingPolicy.budget.budgetPolicyRef !== normalized.budgetPolicyRef
    || normalized.spendingPolicy.rate.ratePolicyRef !== normalized.ratePolicyRef
    || normalized.spendingPolicy.budget.generation !== normalized.generation
    || normalized.spendingPolicy.rate.generation !== normalized.generation
    || agentAccessPolicyDigest(normalized.spendingPolicy) !== normalized.spendingPolicyDigest
  ) return null
  if (args.expected.kind === 'persisted_dispatch' && (
    normalized.grantRef !== args.expected.grantRef
    || normalized.principalId !== args.expected.principalId
    || normalized.ownerId !== args.expected.ownerId
    || normalized.credentialId !== args.expected.credentialId
    || normalized.applicationRef !== args.expected.applicationRef
    || normalized.environment !== args.expected.environment
    || normalized.generation !== args.expected.generation
    || normalized.spendingPolicyDigest !== args.expected.spendingPolicyDigest
    || normalized.expiresAt !== args.expected.expiresAt
  )) return null

  const principal = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', normalized.principalId))
    .unique()
  if (
    principal === null
    || principal.ownerId === args.sellerOwnerId
    || principal.ownerId !== normalized.ownerId
    || principal.credentialId !== normalized.credentialId
    || principal.applicationRef !== normalized.applicationRef
    || principal.environment !== normalized.environment
    || principal.authorityMode !== normalized.authorityMode
    || principal.lifecycle !== 'active'
    || principal.grantGeneration !== normalized.generation
    || principal.spendingPolicyDigest !== normalized.spendingPolicyDigest
    || principal.expiresAt === undefined
    || principal.expiresAt <= args.now
    || !principal.scopes.includes(MARKET_TOOLS_CALL_SCOPE)
  ) return null

  return normalized
}

export const readExactSellerOnboardingCanaryPlatformGrant = internalQuery({
  args: exactPlatformGrantArgs,
  returns: exactPlatformGrantResult,
  handler: readExactSellerOnboardingCanaryPlatformGrantHandler,
})

function custodyEnvironment(): StringEnvironment {
  return {
    CDP_API_KEY_ID: env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: env.CDP_WALLET_SECRET,
    AE_X402_CDP_ACCOUNT_NAME: env.AE_X402_CDP_ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: env.AE_X402_CDP_EXPECTED_EVM_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: env.AE_X402_CDP_ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: env.AE_X402_CDP_PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: env.AE_X402_CDP_POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: env.AE_X402_CDP_CREDENTIAL_GENERATION,
    AE_X402_CUSTODY_ENABLED: env.AE_X402_CUSTODY_ENABLED,
    AE_X402_CUSTODY_MAX_ATOMIC: env.AE_X402_CUSTODY_MAX_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: env.AE_X402_CUSTODY_DAILY_MAX_ATOMIC,
  }
}

/** Mirrors the runtime's bounded one-or-two HTTPS endpoint rule for sandbox. */
function rpcEndpointCount(network: string): number {
  const raw = env.AE_X402_RPC_URLS_JSON?.trim()
  if (raw === undefined || raw.length === 0 || raw.length > MAX_X402_RPC_CONFIG_LENGTH) return 0
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0
    const configured = (parsed as Record<string, unknown>)[network]
    if (!Array.isArray(configured) || configured.length < 1 || configured.length > 2) return 0
    const urls = configured.map((value) => {
      if (typeof value !== 'string' || value.length === 0) return undefined
      try {
        const url = new URL(value)
        return url.protocol === 'https:' ? url.href : undefined
      } catch (cause) {
        return degradeBackend(cause, undefined, { site: 'rpcEndpointCount', reason: 'invalid_response' })
      }
    })
    if (urls.some((url) => url === undefined)) return 0
    return new Set(urls).size === urls.length ? urls.length : 0
  } catch (cause) {
    return degradeBackend(cause, 0, { site: 'rpcEndpointCount', reason: 'invalid_response' })
  }
}

function exactProductionGrantMaterial(
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

/**
 * Privileged deployment operation for the short-lived production canary grant.
 * Owner publication actions cannot invoke internal mutations, and this command
 * never renews automatically.
 */
export const provisionProductionSellerOnboardingCanaryFunding = internalMutation({
  args: {
    generation: v.number(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    now: v.number(),
  },
  returns: productionProvisionResult,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.generation) || args.generation < 1
      || !Number.isSafeInteger(args.issuedAt) || args.issuedAt < 0 || args.issuedAt > args.now
      || !Number.isSafeInteger(args.now) || args.now < 0
      || !Number.isSafeInteger(args.expiresAt)
      || args.expiresAt <= args.now
      || args.expiresAt - args.issuedAt > PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS) {
      return { kind: 'conflict' as const, code: 'issuance_invalid' as const }
    }
    const expected = expectedProductionCanaryGrant(args.generation, args.issuedAt, args.expiresAt)
    const [target, principal, active] = await Promise.all([
      ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', expected.grantRef))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', expected.principalId))
        .unique(),
      ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
          .eq('credentialId', expected.credentialId)
          .eq('environment', 'production')
          .eq('lifecycle', 'active'))
        .take(3),
    ])
    if (target !== null) {
      const principalExact = principal !== null
        && principal.ownerId === expected.ownerId
        && principal.credentialId === expected.credentialId
        && principal.applicationRef === expected.applicationRef
        && principal.environment === 'production'
        && principal.authorityMode === 'spending_policy'
        && principal.lifecycle === 'active'
        && principal.grantGeneration === expected.generation
        && principal.spendingPolicyDigest === expected.spendingPolicyDigest
        && principal.expiresAt === expected.expiresAt
        && principal.scopes.length === 1
        && principal.scopes[0] === MARKET_TOOLS_CALL_SCOPE
      return exactProductionGrantMaterial(target, expected) && principalExact && active.length === 1
        ? {
            kind: 'replayed' as const,
            grantRef: expected.grantRef,
            principalId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
            generation: expected.generation,
            spendingPolicyDigest: expected.spendingPolicyDigest,
            expiresAt: expected.expiresAt,
          }
        : { kind: 'conflict' as const, code: 'material_conflict' as const }
    }
    if (active.length > 1) return { kind: 'conflict' as const, code: 'active_grant_ambiguous' as const }
    const predecessor = active[0]
    if ((args.generation === 1) !== (predecessor === undefined)) {
      return { kind: 'conflict' as const, code: 'generation_gap' as const }
    }
    if (predecessor !== undefined) {
      let normalized: NormalizedStoredAgentAccessGrant
      try {
        normalized = normalizeStoredAgentAccessGrant(predecessor)
      } catch (cause) {
        return degradeBackend(cause, { kind: 'conflict' as const, code: 'material_conflict' as const }, { site: 'provisionProductionSellerOnboardingCanaryFunding', reason: 'invalid_response' })
      }
      const exactPredecessor = expectedProductionCanaryGrant(
        normalized.generation,
        normalized.createdAt,
        normalized.expiresAt,
      )
      if (normalized.generation !== args.generation - 1
        || !exactProductionGrantMaterial(predecessor, exactPredecessor)
        || normalized.grantRef !== productionGrantRef(normalized.generation)
        || normalized.expiresAt - normalized.createdAt > PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS
        || normalized.principalId !== expected.principalId
        || normalized.ownerId !== expected.ownerId
        || normalized.applicationRef !== expected.applicationRef
        || normalized.authorityMode !== 'spending_policy'
        || normalized.budgetPolicyRef !== expected.budgetPolicyRef
        || normalized.ratePolicyRef !== expected.ratePolicyRef) {
        return { kind: 'conflict' as const, code: 'generation_gap' as const }
      }
    }
    if (predecessor !== undefined && principal === null) {
      return { kind: 'conflict' as const, code: 'principal_conflict' as const }
    }
    if (principal !== null && (
      predecessor === undefined
      || principal.ownerId !== expected.ownerId
      || principal.credentialId !== expected.credentialId
      || principal.applicationRef !== expected.applicationRef
      || principal.environment !== 'production'
      || principal.authorityMode !== 'spending_policy'
      || principal.lifecycle !== 'active'
      || principal.grantGeneration !== args.generation - 1
      || principal.spendingPolicyDigest !== predecessor?.spendingPolicyDigest
      || principal.expiresAt !== predecessor?.expiresAt
      || principal.scopes.length !== 1
      || principal.scopes[0] !== MARKET_TOOLS_CALL_SCOPE
    )) return { kind: 'conflict' as const, code: 'principal_conflict' as const }

    if (predecessor !== undefined) {
      await ctx.db.patch(predecessor._id, { lifecycle: 'revoked', updatedAt: args.now })
    }
    await ctx.db.insert('agentAccessGrants', expected)
    const principalMaterial = {
      ownerId: expected.ownerId,
      credentialId: expected.credentialId,
      applicationRef: expected.applicationRef,
      environment: 'production' as const,
      scopes: [MARKET_TOOLS_CALL_SCOPE],
      authorityMode: 'spending_policy' as const,
      grantGeneration: expected.generation,
      spendingPolicyDigest: expected.spendingPolicyDigest,
      lifecycle: 'active' as const,
      expiresAt: expected.expiresAt,
      lastSeenAt: args.now,
    }
    if (principal === null) {
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: expected.principalId,
        ...principalMaterial,
        recordedAt: args.now,
      })
    } else {
      await ctx.db.patch(principal._id, principalMaterial)
    }
    return {
      kind: 'ensured' as const,
      grantRef: expected.grantRef,
      principalId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: expected.generation,
      spendingPolicyDigest: expected.spendingPolicyDigest,
      expiresAt: expected.expiresAt,
    }
  },
})

export const provisionSellerOnboardingCanaryFunding = internalMutation({
  args: { now: v.number() },
  returns: provisionResult,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0 || args.now >= SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT) {
      return { kind: 'conflict' as const, codes: ['canary_grant_stale' as const] }
    }
    const expected = expectedCanaryGrant(args.now)
    const [grant, principal, grantsForCredential, principalForCredential] = await Promise.all([
      ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID))
        .unique(),
      ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
          .eq('credentialId', SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID)
          .eq('environment', 'sandbox')
          .eq('lifecycle', 'active'))
        .take(2),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_credentialId', (query) => query.eq('credentialId', SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID))
        .unique(),
    ])

    const conflicts = new Set<ReadinessCode>()
    if (grant !== null) {
      for (const code of grantReadinessCodes(grant, expected, args.now)) conflicts.add(code)
    }
    if (principal !== null) {
      for (const code of principalReadinessCodes(principal, expected, args.now)) conflicts.add(code)
    }
    if (grantsForCredential.some((row) => row.grantRef !== SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF)) {
      conflicts.add('canary_grant_ambiguous')
    }
    if (principalForCredential !== null && principalForCredential.principalId !== SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID) {
      conflicts.add('canary_credential_conflict')
    }
    if (conflicts.size > 0) {
      return { kind: 'conflict' as const, codes: [...conflicts].sort() }
    }

    const created: ('principal' | 'grant')[] = []
    if (grant === null) {
      await ctx.db.insert('agentAccessGrants', expected)
      created.push('grant')
    }
    if (principal === null) {
      await ctx.db.insert('agentAccessPrincipals', {
        principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
        ownerId: SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
        credentialId: SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
        applicationRef: SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
        environment: 'sandbox',
        scopes: [MARKET_TOOLS_CALL_SCOPE],
        authorityMode: 'unrestricted_test_only',
        grantGeneration: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
        spendingPolicyDigest: expected.spendingPolicyDigest,
        lifecycle: 'active',
        expiresAt: SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT,
        recordedAt: args.now,
        lastSeenAt: args.now,
      })
      created.push('principal')
    }
    return {
      kind: 'ensured' as const,
      created,
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
      spendingPolicyDigest: expected.spendingPolicyDigest,
      budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
    }
  },
})

export const readSellerOnboardingCanaryFundingReadiness = internalQuery({
  args: { now: v.number() },
  returns: readinessResult,
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0 || args.now >= SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT) {
      return {
        kind: 'not_ready' as const,
        codes: ['canary_grant_stale' as const],
        checkedAt: args.now,
      }
    }
    const expected = expectedCanaryGrant(args.now)
    const [grant, principal, grantsForCredential, principalForCredential] = await Promise.all([
      ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID))
        .unique(),
      ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
          .eq('credentialId', SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID)
          .eq('environment', 'sandbox')
          .eq('lifecycle', 'active'))
        .take(2),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_credentialId', (query) => query.eq('credentialId', SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID))
        .unique(),
    ])
    const codes = new Set<ReadinessCode>()
    if (grant === null) codes.add('canary_grant_missing')
    else for (const code of grantReadinessCodes(grant, expected, args.now)) codes.add(code)
    if (principal === null) codes.add('canary_principal_missing')
    else for (const code of principalReadinessCodes(principal, expected, args.now)) codes.add(code)
    if (grantsForCredential.length > 1
      || grantsForCredential.some((row) => row.grantRef !== SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF)) {
      codes.add('canary_grant_ambiguous')
    }
    if (principalForCredential !== null
      && principalForCredential.principalId !== SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID) {
      codes.add('canary_credential_conflict')
    }

    const profile = x402PaymentProfileForEnvironment('sandbox')
    if (profile === undefined
      || profile.profile !== 'base-sepolia-usdc-exact'
      || profile.network !== BASE_SEPOLIA_NETWORK
      || profile.asset !== BASE_SEPOLIA_USDC_ADDRESS
      || profile.scheme !== 'exact'
      || profile.transferMethod !== 'eip3009') {
      codes.add('x402_sandbox_profile_invalid')
    }
    const custody = cdpX402CustodyConfigurationFromEnvironment(custodyEnvironment())
    if (custody === undefined) codes.add('cdp_custody_configuration_missing')
    else if (
      custody.maxAtomic !== BigInt(SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC)
      || custody.dailyMaxAtomic !== BigInt(SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC)
    ) codes.add('cdp_custody_cap_mismatch')
    const configuredRpcEndpointCount = rpcEndpointCount(BASE_SEPOLIA_NETWORK)
    if (configuredRpcEndpointCount === 0) codes.add('x402_sandbox_rpc_configuration_missing')

    if (codes.size > 0 || grant === null || principal === null || custody === undefined || profile === undefined) {
      return { kind: 'not_ready' as const, codes: [...codes].sort(), checkedAt: args.now }
    }
    return {
      kind: 'ready' as const,
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
      spendingPolicyDigest: expected.spendingPolicyDigest,
      budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
      paymentProfile: 'base-sepolia-usdc-exact' as const,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      rpcEndpointCount: configuredRpcEndpointCount,
      custodyCredentialGeneration: custody.credentialGeneration,
      custodyPolicyRulesDigest: custody.policyRulesDigest,
      checkedAt: args.now,
    }
  },
})

export const readProductionSellerOnboardingCanaryFundingReadiness = internalQuery({
  args: { now: v.number() },
  returns: productionReadinessResult,
  handler: async (ctx, args) => {
    const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(ctx, {
      sellerOwnerId: 'deployment:production-canary-readiness',
      expected: { kind: 'current_platform_grant', environment: 'production' },
      now: args.now,
    })
    const codes = new Set<ReadinessCode>()
    if (grant === null) codes.add('canary_grant_missing')
    const profile = x402PaymentProfileForEnvironment('production')
    if (profile === undefined
      || profile.profile !== 'base-usdc-exact'
      || profile.network !== BASE_MAINNET_NETWORK
      || profile.asset !== BASE_MAINNET_USDC_ADDRESS) codes.add('x402_production_profile_invalid')
    const custody = cdpX402CustodyConfigurationFromEnvironment(custodyEnvironment())
    if (custody === undefined) codes.add('cdp_custody_configuration_missing')
    else if (custody.maxAtomic !== BigInt(PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC)
      || custody.dailyMaxAtomic !== BigInt(PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC)) {
      codes.add('cdp_custody_cap_mismatch')
    }
    const configuredRpcEndpointCount = rpcEndpointCount(BASE_MAINNET_NETWORK)
    if (configuredRpcEndpointCount !== 2) codes.add('x402_production_rpc_configuration_missing')
    if (codes.size > 0 || grant === null || profile === undefined || custody === undefined) {
      return { kind: 'not_ready' as const, codes: [...codes].sort(), checkedAt: args.now }
    }
    return {
      kind: 'ready' as const,
      grantRef: grant.grantRef,
      principalId: PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: grant.generation,
      spendingPolicyDigest: grant.spendingPolicyDigest,
      budgetPolicyRef: PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
      paymentProfile: 'base-usdc-exact' as const,
      network: BASE_MAINNET_NETWORK,
      asset: BASE_MAINNET_USDC_ADDRESS,
      rpcEndpointCount: configuredRpcEndpointCount,
      custodyCredentialGeneration: custody.credentialGeneration,
      custodyPolicyRulesDigest: custody.policyRulesDigest,
      checkedAt: args.now,
    }
  },
})
