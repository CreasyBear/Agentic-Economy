import { degradeBackend } from '@/lib/observability/degrade-backend'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import {
  normalizeStoredAgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'

import type { MutationCtx } from '../../_generated/server'
import {
  exactProductionGrantMaterial,
  expectedCanaryGrant,
  expectedProductionCanaryGrant,
  grantReadinessCodes,
  principalReadinessCodes,
  PRODUCTION_CANARY_GRANT_MAX_LIFETIME_MS,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  productionGrantRef,
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_EXPIRES_AT,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  type ReadinessCode,
} from './canaryFundingIdentity'

/**
 * Privileged deployment operation for the short-lived production canary grant.
 * Owner publication actions cannot invoke internal mutations, and this command
 * never renews automatically.
 */
export async function provisionProductionSellerOnboardingCanaryFundingHandler(
  ctx: MutationCtx,
  args: {
    generation: number
    issuedAt: number
    expiresAt: number
    now: number
  },
) {
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
}

export async function provisionSellerOnboardingCanaryFundingHandler(
  ctx: MutationCtx,
  args: { now: number },
) {
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
}
