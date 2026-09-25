import { degradeBackend } from '@/lib/observability/degrade-backend'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  agentAccessPolicyDigest,
  normalizeStoredAgentAccessGrant,
  type AgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
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

import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
} from './constants'
import { custodyEnvironment, rpcEndpointCount } from './custody'
import {
  canaryPolicy,
  expectedCanaryGrant,
  grantReadinessCodes,
  principalReadinessCodes,
  PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS,
  PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  productionGrantRef,
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  type ReadinessCode,
  type SellerOnboardingCanaryPlatformGrantExpectation,
} from './identity'

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

export async function readSellerOnboardingCanaryFundingReadinessHandler(
  ctx: QueryCtx,
  args: { now: number },
) {
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
}

export async function readProductionSellerOnboardingCanaryFundingReadinessHandler(
  ctx: QueryCtx,
  args: { now: number },
) {
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
}
