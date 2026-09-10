/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import {
  LEGACY_AGENT_ACCESS_GRANT_FORMAT,
  LEGACY_AGENT_ACCESS_POLICY_FORMAT,
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
  type LegacyAgentAccessPolicy,
  type NormalizedStoredAgentAccessGrant,
} from '../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import schema from './schema'
import { api } from './_generated/api'

const modules = import.meta.glob('./**/*.ts')
const SERVICE_KEY = 'agent-access-server-function-key-that-is-at-least-32-bytes'
const SERVER_SCOPE = 'market_tools:call'

type RegisterArgs = Readonly<{ grant: AgentAccessGrant; serviceAuth: CustomerRequestServiceAssertion }>
type GrantWriteResult = Readonly<Record<string, unknown>>
type Backend = TestConvex<typeof schema>
type ProtectedAuthorityMode = 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
type LegacyStoredGrant = Readonly<{
  format: typeof LEGACY_AGENT_ACCESS_GRANT_FORMAT
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: 'sandbox' | 'production'
  authorityMode: ProtectedAuthorityMode
  budgetPolicyRef: string
  ratePolicyRef: string
  lifecycle: 'active' | 'revoked' | 'expired'
  generation: number
  policyDigest: string
  createdAt: number
  updatedAt: number
  expiresAt: number
  operationAccess: 'all_admitted'
  policy: LegacyAgentAccessPolicy
}>

const registerGrantForServer = makeFunctionReference<'mutation', RegisterArgs, GrantWriteResult>('agentAccessPolicy:registerGrantForServer')
const readGrant = makeFunctionReference<'query', { grantRef: string }, NormalizedStoredAgentAccessGrant | null>('agentAccessPolicy:readGrant')

const previousServerKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
afterEach(() => {
  if (previousServerKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServerKey
})

function grantInput(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrantInput {
  return {
    grantRef: 'grant:server-wrapper',
    principalId: 'clerk_api_key:key_server_wrapper',
    ownerId: 'owner:server-wrapper',
    applicationRef: 'agentic-economy',
    credentialId: 'key_server_wrapper',
    environment: 'sandbox',
    toolAccess: 'all_admitted',
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    lifecycle: 'active',
    generation: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    expiresAt: 10_000,
    ...overrides,
  }
}

function grant(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrant {
  const result = createAgentAccessGrant(grantInput(overrides))
  if (result.kind === 'refused') throw new Error(result.code)
  return result.grant
}

const toolRef = (value: string) => `operation:v1:${value.repeat(64)}`

function selectedGrant(toolRefs: readonly string[], overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrant {
  const base = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  return grant({
    toolAccess: 'selected_tools',
    toolRefs,
    spendingPolicy: {
      ...base,
      toolAccess: 'selected_tools',
      toolRefs: [...toolRefs],
    },
    ...overrides,
  })
}

function legacyStoredGrant(ownerId = 'owner:server-wrapper'): LegacyStoredGrant {
  const current = grant()
  const {
    format: _policyFormat,
    toolAccess: _policyToolAccess,
    toolRefs: _policyToolRefs,
    budget: currentBudget,
    ...policyMaterial
  } = current.spendingPolicy
  const legacyPolicy = {
    ...policyMaterial,
    format: LEGACY_AGENT_ACCESS_POLICY_FORMAT,
    operationAccess: 'all_admitted',
    budget: {
      budgetPolicyRef: currentBudget.budgetPolicyRef,
      generation: currentBudget.generation,
      currency: currentBudget.currency,
      exponent: currentBudget.exponent,
      maximumSpendPerInvocation: currentBudget.maximumSpendPerCall,
      maximumDailySpend: currentBudget.maximumDailySpend,
      maximumMonthlySpend: currentBudget.maximumMonthlySpend,
      maximumConcurrentInvocations: currentBudget.maximumConcurrentCalls,
    },
  } satisfies LegacyAgentAccessPolicy
  return {
    format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
    grantRef: current.grantRef,
    principalId: current.principalId,
    ownerId,
    applicationRef: current.applicationRef,
    credentialId: current.credentialId,
    environment: current.environment,
    authorityMode: 'approve_each',
    budgetPolicyRef: current.budgetPolicyRef,
    ratePolicyRef: current.ratePolicyRef,
    lifecycle: current.lifecycle,
    generation: current.generation,
    policyDigest: canonicalDigest(legacyPolicy),
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    expiresAt: current.expiresAt,
    operationAccess: 'all_admitted',
    policy: legacyPolicy,
  }
}

const ownerIdentity = (): UserIdentity => ({
  subject: 'owner_readback',
  issuer: 'https://clerk.example.test',
  tokenIdentifier: 'https://clerk.example.test|owner_readback',
  exp: Math.floor(Date.now() / 1_000) + 3_600,
})

async function serviceAuth(
  operation: string,
  command: Record<string, unknown>,
  principal: Readonly<{ principalId: string; ownerId: string; credentialId: string }>,
  key = SERVICE_KEY,
): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key,
    operation,
    command: toStableHashValue(command),
    principal: { ...principal, scopes: [SERVER_SCOPE] },
    issuedAt: Date.now(),
  })
}

async function seedCanonicalPrincipal(
  backend: Backend,
  current: AgentAccessGrant,
  ownerId = `acc_${'a'.repeat(32)}`,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: current.principalId,
      ownerId,
      ownerTokenIdentifier: current.ownerId,
      credentialId: current.credentialId,
      applicationRef: current.applicationRef,
      environment: current.environment,
      scopes: [SERVER_SCOPE],
      authorityMode: current.authorityMode,
      grantGeneration: current.generation,
      spendingPolicyDigest: current.spendingPolicyDigest,
      lifecycle: 'active',
      recordedAt: 1,
      lastSeenAt: 1,
    })
  })
}

describe('agent access Convex server grant wrappers', () => {
  it('requires the server token and exact grant principal binding', async () => {
    const backend = convexTest(schema, modules)
    const current = grant()
    await seedCanonicalPrincipal(backend, current)
    const command = { grant: current }
    const assertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', command, current)

    delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: assertion }))
      .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const wrongPrincipal = await serviceAuth('agentAccessPolicy.registerGrantForServer', command, {
      ...current,
      principalId: 'clerk_api_key:key_other',
    })
    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: wrongPrincipal }))
      .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: assertion }))
      .resolves.toEqual({
        kind: 'recorded',
        grantRef: current.grantRef,
        generation: current.generation,
        spendingPolicyDigest: current.spendingPolicyDigest,
        lifecycle: current.lifecycle,
        expiresAt: current.expiresAt,
      })

    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: assertion }))
      .resolves.toEqual({
        kind: 'replayed',
        grantRef: current.grantRef,
        generation: current.generation,
        spendingPolicyDigest: current.spendingPolicyDigest,
        lifecycle: current.lifecycle,
        expiresAt: current.expiresAt,
      })

    await expect(backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', current.grantRef)).unique()))
      .resolves.toMatchObject({
        format: 'ae.agent-access-grant:v2',
        spendingPolicyDigest: current.spendingPolicyDigest,
        spendingPolicy: { format: 'ae.agent-access-policy:v2', toolAccess: 'all_admitted', toolRefs: [] },
      })
  })

  it('reads legacy v1 rows with derived selection while preserving v1 format and digest', async () => {
    const backend = convexTest(schema, modules)
    const legacy = legacyStoredGrant()
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessGrants', legacy)
    })

    await expect(backend.query(readGrant, { grantRef: legacy.grantRef })).resolves.toMatchObject({
      format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: { format: LEGACY_AGENT_ACCESS_POLICY_FORMAT, operationAccess: 'all_admitted' },
      spendingPolicyDigest: legacy.policyDigest,
    })
    const normalized = await backend.query(readGrant, { grantRef: legacy.grantRef })
    expect(normalized).not.toBeNull()
    if (normalized === null) return
    expect('toolRefs' in normalized.spendingPolicy).toBe(false)
    expect(normalized.spendingPolicyDigest).toBe(legacy.policyDigest)
    expect(canonicalDigest(legacy.policy)).toBe(normalized.spendingPolicyDigest)
  })

  it('projects legacy owner readbacks through the normalized budget boundary', async () => {
    const backend = convexTest(schema, modules)
    const owner = backend.withIdentity(ownerIdentity())
    await expect(owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})).resolves.toBe(true)
    const account = await backend.run(async (ctx) => {
      const rows = await ctx.db.query('accounts').take(1)
      return rows[0] ?? null
    })
    if (account === null) throw new Error('owner_account_missing')

    const legacy = legacyStoredGrant(account.accountRef)
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessGrants', legacy)
    })

    await expect(owner.query(api.agentAccessPolicy.listOwnerGrantReadbacks, {})).resolves.toEqual([{
      principalId: legacy.principalId,
      credentialId: legacy.credentialId,
      applicationRef: legacy.applicationRef,
      environment: legacy.environment,
      authorityMode: 'approval_required',
      toolAccess: 'all_admitted',
      toolRefs: [],
      lifecycle: legacy.lifecycle,
      expiresAt: legacy.expiresAt,
      budget: {
        maximumSpendPerCall: legacy.policy.budget.maximumSpendPerInvocation,
        maximumDailySpend: legacy.policy.budget.maximumDailySpend,
        maximumMonthlySpend: legacy.policy.budget.maximumMonthlySpend,
        maximumConcurrentCalls: legacy.policy.budget.maximumConcurrentInvocations,
      },
      rate: {
        maximumCallsPerMinute: legacy.policy.rate.maximumCallsPerMinute,
        maximumCallsPerHour: legacy.policy.rate.maximumCallsPerHour,
      },
    }])
  })

  it('rejects all four hybrid stored grant shapes at the schema boundary', async () => {
    const legacy = legacyStoredGrant()
    const current = grant()
    const { toolRefs: _topLevelRefs, ...v2WithoutTopLevelRefs } = current
    const { toolRefs: _policyRefs, ...v2PolicyWithoutRefs } = current.spendingPolicy
    const hybrids = [
      { ...legacy, operationRefs: [] },
      { ...legacy, policy: { ...legacy.policy, operationRefs: [] } },
      v2WithoutTopLevelRefs,
      { ...current, spendingPolicy: v2PolicyWithoutRefs },
    ]

    for (const hybrid of hybrids) {
      const backend = convexTest(schema, modules)
      await expect(backend.run(async (ctx) => await ctx.db.insert('agentAccessGrants', hybrid as never)))
        .rejects.toThrow()
    }
  })

  it('replays the same selected-tool material and conflicts when references change', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const firstRef = toolRef('a')
    const secondRef = toolRef('b')
    const current = selectedGrant([firstRef, secondRef])
    const reordered = {
      ...current,
      toolRefs: [secondRef, firstRef],
      spendingPolicy: { ...current.spendingPolicy, toolRefs: [secondRef, firstRef] },
    }
    await seedCanonicalPrincipal(backend, current)
    const reorderedAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: reordered }, current)

    await expect(backend.mutation(registerGrantForServer, { grant: reordered, serviceAuth: reorderedAssertion }))
      .resolves.toMatchObject({ kind: 'recorded' })
    const canonicalAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: current }, current)
    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: canonicalAssertion }))
      .resolves.toMatchObject({ kind: 'replayed' })

    const changed = selectedGrant([firstRef, toolRef('c')])
    const changedAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: changed }, changed)
    await expect(backend.mutation(registerGrantForServer, { grant: changed, serviceAuth: changedAssertion }))
      .resolves.toEqual({ kind: 'conflict', code: 'grant_exists' })
  })

})
