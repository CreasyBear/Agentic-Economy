import { v } from 'convex/values'

import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessPolicy,
} from '@/modules/agent-access/policy'
import { agentAccessGrantValue } from '@/modules/agent-access/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  cdpX402CustodyConfigurationFromEnvironment,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'

import { env, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'

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

// CDP's maintained x402 spend-control example uses `environment: development`
// (Base Sepolia), 10,000 atomic units per payment, and 50,000 cumulative:
// github.com/coinbase/cdp-sdk/blob/7ef6ce6cec532dff55eca479a31bbbefac4740b7/
// examples/typescript/x402/clients/payForApiWithSpendControls.ts
// The first AE lane intentionally makes the ledger's monthly ceiling equal to
// that cumulative ceiling as well.
export const SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC = '10000' as const
export const SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC = '50000' as const
export const SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC = '50000' as const

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
)

const provisionResult = v.union(
  v.object({
    kind: v.literal('ensured'),
    created: v.array(v.union(v.literal('principal'), v.literal('grant'))),
    grantRef: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF),
    principalId: v.literal(SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID),
    generation: v.literal(SELLER_ONBOARDING_CANARY_GRANT_GENERATION),
    policyDigest: v.string(),
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
    policyDigest: v.string(),
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

const exactPlatformGrantArgs = {
  sellerOwnerId: v.string(),
  expected: v.union(
    v.object({ kind: v.literal('current_platform_grant') }),
    v.object({
      kind: v.literal('persisted_dispatch'),
      grantRef: v.string(),
      principalId: v.string(),
      ownerId: v.string(),
      credentialId: v.string(),
      applicationRef: v.string(),
      environment: v.literal('sandbox'),
      generation: v.number(),
      policyDigest: v.string(),
      expiresAt: v.number(),
    }),
  ),
  now: v.number(),
} as const

const exactPlatformGrantResult = v.union(agentAccessGrantValue, v.null())

export type SellerOnboardingCanaryPlatformGrantExpectation = Readonly<{
  sellerOwnerId: string
  expected: Readonly<{ kind: 'current_platform_grant' }> | Readonly<{
    kind: 'persisted_dispatch'
    grantRef: string
    principalId: string
    ownerId: string
    credentialId: string
    applicationRef: string
    environment: 'sandbox'
    generation: number
    policyDigest: string
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

function canaryPolicy(): AgentAccessPolicy {
  const amount = (units: string) => ({ currency: 'USD', units, exponent: 6 })
  return {
    format: 'ae.agent-access-policy:v1',
    operationAccess: 'all_admitted',
    environment: 'sandbox',
    budget: {
      budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
      generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
      currency: 'USD',
      exponent: 6,
      maximumSpendPerInvocation: amount(SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC),
      maximumDailySpend: amount(SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC),
      maximumMonthlySpend: amount(SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC),
      maximumConcurrentInvocations: 1,
    },
    rate: {
      ratePolicyRef: SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
      generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
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
    operationAccess: 'all_admitted',
    authorityMode: 'full_yolo',
    policy: canaryPolicy(),
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

export function sellerOnboardingCanaryPlatformGrantExpectation(
  sellerOwnerId: string,
  now: number,
): SellerOnboardingCanaryPlatformGrantExpectation {
  return {
    sellerOwnerId,
    expected: { kind: 'current_platform_grant' },
    now,
  }
}

function grantReadinessCodes(
  grant: AgentAccessGrant,
  expected: AgentAccessGrant,
  now: number,
): ReadinessCode[] {
  const codes: ReadinessCode[] = []
  if (
    grant.grantRef !== expected.grantRef
    || grant.principalId !== expected.principalId
    || grant.ownerId !== expected.ownerId
    || grant.applicationRef !== expected.applicationRef
    || grant.credentialId !== expected.credentialId
    || grant.environment !== 'sandbox'
    || grant.operationAccess !== 'all_admitted'
    || grant.authorityMode !== 'full_yolo'
    || grant.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    || grant.expiresAt !== SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT
  ) codes.push('canary_grant_material_invalid')
  if (grant.lifecycle !== 'active' || grant.expiresAt <= now) {
    codes.push('canary_grant_stale')
  }
  if (
    grant.policyDigest !== expected.policyDigest
    || canonicalDigest(grant.policy as never) !== expected.policyDigest
    || grant.budgetPolicyRef !== SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF
    || grant.ratePolicyRef !== SELLER_ONBOARDING_CANARY_RATE_POLICY_REF
    || grant.policy.budget.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    || grant.policy.rate.generation !== SELLER_ONBOARDING_CANARY_GRANT_GENERATION
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
    authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
    grantGeneration: number
    policyDigest: string
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
    && principal.scopes[0] === MARKET_OPERATIONS_INVOKE_SCOPE
    && principal.authorityMode === 'full_yolo'
    && principal.grantGeneration === SELLER_ONBOARDING_CANARY_GRANT_GENERATION
    && principal.policyDigest === expected.policyDigest
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
  if (args.sellerOwnerId === SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID) return null

  const grant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF))
    .unique()
  if (
    grant === null
    || grant.principalId !== SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID
    || grant.ownerId !== SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID
    || grant.credentialId !== SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID
    || grant.applicationRef !== SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF
    || grant.environment !== 'sandbox'
    || grant.lifecycle !== 'active'
    || grant.expiresAt <= args.now
    || grant.authorityMode !== 'full_yolo'
    || grant.operationAccess !== 'all_admitted'
    || grant.policy.environment !== 'sandbox'
    || grant.policy.operationAccess !== 'all_admitted'
    || grant.budgetPolicyRef !== SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF
    || grant.ratePolicyRef !== SELLER_ONBOARDING_CANARY_RATE_POLICY_REF
    || grant.policy.budget.budgetPolicyRef !== grant.budgetPolicyRef
    || grant.policy.rate.ratePolicyRef !== grant.ratePolicyRef
    || grant.policy.budget.generation !== grant.generation
    || grant.policy.rate.generation !== grant.generation
    || canonicalDigest(grant.policy as never) !== grant.policyDigest
  ) return null
  if (args.expected.kind === 'persisted_dispatch' && (
    grant.grantRef !== args.expected.grantRef
    || grant.principalId !== args.expected.principalId
    || grant.ownerId !== args.expected.ownerId
    || grant.credentialId !== args.expected.credentialId
    || grant.applicationRef !== args.expected.applicationRef
    || grant.environment !== args.expected.environment
    || grant.generation !== args.expected.generation
    || grant.policyDigest !== args.expected.policyDigest
    || grant.expiresAt !== args.expected.expiresAt
  )) return null

  const principal = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', grant.principalId))
    .unique()
  if (
    principal === null
    || principal.ownerId === args.sellerOwnerId
    || principal.ownerId !== grant.ownerId
    || principal.credentialId !== grant.credentialId
    || principal.applicationRef !== grant.applicationRef
    || principal.environment !== grant.environment
    || principal.authorityMode !== grant.authorityMode
    || principal.lifecycle !== 'active'
    || principal.grantGeneration !== grant.generation
    || principal.policyDigest !== grant.policyDigest
    || principal.expiresAt === undefined
    || principal.expiresAt <= args.now
    || !principal.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
  ) return null

  const { _id, _creationTime, ...material } = grant
  return material
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
function sandboxRpcEndpointCount(): number {
  const raw = env.AE_X402_RPC_URLS_JSON?.trim()
  if (raw === undefined || raw.length === 0 || raw.length > MAX_X402_RPC_CONFIG_LENGTH) return 0
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0
    const configured = (parsed as Record<string, unknown>)[BASE_SEPOLIA_NETWORK]
    if (!Array.isArray(configured) || configured.length < 1 || configured.length > 2) return 0
    const urls = configured.map((value) => {
      if (typeof value !== 'string' || value.length === 0) return undefined
      try {
        const url = new URL(value)
        return url.protocol === 'https:' ? url.href : undefined
      } catch {
        return undefined
      }
    })
    if (urls.some((url) => url === undefined)) return 0
    return new Set(urls).size === urls.length ? urls.length : 0
  } catch {
    return 0
  }
}

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
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
        authorityMode: 'full_yolo',
        grantGeneration: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
        policyDigest: expected.policyDigest,
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
      policyDigest: expected.policyDigest,
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
    const rpcEndpointCount = sandboxRpcEndpointCount()
    if (rpcEndpointCount === 0) codes.add('x402_sandbox_rpc_configuration_missing')

    if (codes.size > 0 || grant === null || principal === null || custody === undefined || profile === undefined) {
      return { kind: 'not_ready' as const, codes: [...codes].sort(), checkedAt: args.now }
    }
    return {
      kind: 'ready' as const,
      grantRef: SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
      principalId: SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
      generation: SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
      policyDigest: grant.policyDigest,
      budgetPolicyRef: SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
      paymentProfile: 'base-sepolia-usdc-exact' as const,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      rpcEndpointCount,
      custodyCredentialGeneration: custody.credentialGeneration,
      custodyPolicyRulesDigest: custody.policyRulesDigest,
      checkedAt: args.now,
    }
  },
})
