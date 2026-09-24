import { v } from 'convex/values'

import { agentAccessGrantValue } from '@/modules/agent-access/public'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
} from '@/modules/capability-supply/convex'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
} from '@/modules/capability-supply/public'

import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
} from './identity'

export const readinessCode = v.union(
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

export const provisionResult = v.union(
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

export const readinessResult = v.union(
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

export const productionProvisionResult = v.union(
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

export const productionReadinessResult = v.union(
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

export const exactPlatformGrantArgs = {
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

export const exactPlatformGrantResult = v.union(agentAccessGrantValue, v.null())

export const sandboxProvisionArgs = { now: v.number() } as const
export const sandboxReadinessArgs = { now: v.number() } as const
export const productionProvisionArgs = {
  generation: v.number(),
  issuedAt: v.number(),
  expiresAt: v.number(),
  now: v.number(),
} as const
export const productionReadinessArgs = { now: v.number() } as const
