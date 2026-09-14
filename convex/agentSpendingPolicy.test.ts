/// <reference types="vite/client" />
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentCredentialReplacementRegistration,
  IssuedAgentBindingRegistration,
} from '../src/modules/agent-access/agent-access'
import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  type AgentSpendingLimitsResult,
  type AgentSpendingLimitsUpdate,
} from '../src/modules/agent-access/spending-policy-update'
import { normalizeStoredAgentAccessGrant } from '../src/modules/agent-access/policy'
import { issuedAgentGrantRef } from '../src/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import schema from './schema'
import { api } from './_generated/api'

const modules = import.meta.glob('./**/*.ts')
const NOW = 10_000
const SERVICE_KEY = 'agent-spending-policy-server-key-at-least-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const PREPARE_REPLACEMENT_OPERATION = 'agentAccessPrincipals.prepareCredentialReplacementForServer'

const updatePolicy = makeFunctionReference<
  'mutation',
  AgentSpendingLimitsUpdate & Readonly<{ correlationRef: string }>,
  AgentSpendingLimitsResult
>('agentSpendingPolicy:updateForServer')
const readPolicy = makeFunctionReference<
  'query',
  Readonly<{ principalRef: string }>,
  Record<string, unknown>
>('agentSpendingPolicy:readCurrent')
const registerIssuedBinding = makeFunctionReference<
  'mutation',
  IssuedAgentBindingRegistration & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
  Record<string, unknown>
>('agentAccessPrincipals:registerIssuedAgentBindingForServer')
const prepareReplacement = makeFunctionReference<
  'mutation',
  AgentCredentialReplacementRegistration & Readonly<{ serviceAuth: CustomerRequestServiceAssertion }>,
  Record<string, unknown>
>('agentAccessPrincipals:prepareCredentialReplacementForServer')

const identity = (subject: string): UserIdentity => ({
  subject,
  issuer: 'https://clerk.example.test',
  tokenIdentifier: `https://clerk.example.test|${subject}`,
  exp: 1_000,
})

const amount = (units: string): AgentSpendingLimitsUpdate['maximumSpendPerCall'] => ({
  currency: 'AUD',
  units,
  exponent: 6,
})

function bindingInput(subject = 'user_owner'): IssuedAgentBindingRegistration {
  const issuanceKey = 'spending-policy-agent-12345678'
  return {
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId: 'key_spending_policy_agent',
    displayName: 'Spending policy Agent',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    scopes: ['customer_requests:read_only', 'market_tools:call'],
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }),
    toolAccess: 'all_admitted',
    toolRefs: [],
    createdAt: NOW,
    expiresAt: NOW + 600_000,
  }
}

async function serviceAssertion(
  operation: string,
  command: Record<string, unknown>,
): Promise<CustomerRequestServiceAssertion> {
  return await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation,
    command: toStableHashValue(command),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: ['market_tools:call'],
    },
    issuedAt: NOW,
  })
}

type Backend = TestConvex<typeof schema>
type Owner = ReturnType<Backend['withIdentity']>

async function provisionAgent(backend: Backend): Promise<Readonly<{
  owner: Owner
  input: IssuedAgentBindingRegistration
  principalRef: string
}>> {
  const owner = backend.withIdentity(identity('user_owner'))
  await owner.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
  const input = bindingInput()
  await expect(owner.mutation(registerIssuedBinding, {
    ...input,
    serviceAuth: await serviceAssertion(REGISTER_OPERATION, {
      ...input,
      scopes: [...input.scopes],
      toolRefs: [...input.toolRefs],
    }),
  })).resolves.toMatchObject({ kind: 'recorded' })
  const admission = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (q) => q.eq('credentialId', input.credentialId))
    .unique())
  if (admission === null) throw new Error('spending_policy_agent_missing')
  return { owner, input, principalRef: admission.principalId }
}

function command(principalRef: string, overrides: Partial<AgentSpendingLimitsUpdate & { correlationRef: string }> = {}) {
  return {
    principalRef,
    expectedGeneration: 1,
    idempotencyKey: 'spending-policy-update-1',
    maximumSpendPerCall: amount('700000'),
    maximumDailySpend: amount('3500000'),
    maximumMonthlySpend: amount('9000000'),
    correlationRef: 'corr-spending-policy-1',
    ...overrides,
  }
}

describe('owner Agent spending policy mutation', () => {
  const previousKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousKey
  })

  it('reads the current owner policy, updates limits once, and replays the original revision', async () => {
    const backend = convexTest(schema, modules)
    const { owner, input, principalRef } = await provisionAgent(backend)
    const before = await backend.run(async (ctx) => ({
      admission: await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).unique(),
      credential: await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', (q) => q.eq('principalRef', principalRef).eq('lifecycle', 'active')).unique(),
      grant: await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (q) => q.eq('grantRef', input.grantRef)).unique(),
    }))
    if (before.admission === null || before.credential === null || before.grant === null) {
      throw new Error('spending_policy_before_material_missing')
    }
    const beforeGrant = normalizeStoredAgentAccessGrant(before.grant)
    if (beforeGrant.format !== 'ae.agent-access-grant:v2') {
      throw new Error('spending_policy_before_grant_format_invalid')
    }

    await expect(owner.query(readPolicy, { principalRef })).resolves.toMatchObject({
      kind: 'current',
      principalRef,
      grantRef: input.grantRef,
      generation: 1,
      maximumSpendPerCall: amount('1000000'),
      maximumDailySpend: amount('5000000'),
      maximumMonthlySpend: amount('20000000'),
    })

    const first = command(principalRef)
    await expect(owner.mutation(updatePolicy, first)).resolves.toMatchObject({
      kind: 'completed',
      principalRef,
      generation: 2,
    })
    const completed = await owner.mutation(updatePolicy, first)
    expect(completed).toMatchObject({ kind: 'replayed', principalRef, generation: 2 })

    const afterFirst = await backend.run(async (ctx) => {
      const admission = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).unique()
      if (admission === null) throw new Error('spending_policy_admission_missing')
      const activeGrants = await ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (q) => q
          .eq('credentialId', before.admission!.credentialId)
          .eq('environment', input.environment)
          .eq('lifecycle', 'active'))
        .take(2)
      const currentDelegation = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (q) => q.eq('grantRef', admission.grantGeneration === 2
          ? activeGrants[0]?.grantRef ?? ''
          : input.grantRef))
        .unique()
      const oldDelegation = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (q) => q.eq('grantRef', input.grantRef)).unique()
      const events = await ctx.db.query('auditEvents')
        .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (q) => q
          .eq('activeAccountRef', admission.ownerId)
          .eq('targetType', 'agent')
          .eq('targetRef', principalRef))
        .collect()
      return {
        admission,
        activeGrants,
        currentDelegation,
        oldDelegation,
        credential: await ctx.db.query('credentials')
          .withIndex('by_credentialRef', (q) => q.eq('credentialRef', before.credential!.credentialRef)).unique(),
        oldGrant: await ctx.db.query('agentAccessGrants')
          .withIndex('by_grantRef', (q) => q.eq('grantRef', input.grantRef)).unique(),
        events,
      }
    })
    expect(afterFirst.admission).toMatchObject({
      principalId: before.admission.principalId,
      credentialId: before.admission.credentialId,
      grantGeneration: 2,
      spendingPolicyDigest: expect.any(String),
    })
    expect(afterFirst.activeGrants).toHaveLength(1)
    expect(afterFirst.activeGrants[0]).toMatchObject({
      principalId: principalRef,
      credentialId: before.admission.credentialId,
      generation: 2,
      lifecycle: 'active',
      spendingPolicy: {
        budget: {
          generation: 2,
          maximumSpendPerCall: amount('700000'),
          maximumDailySpend: amount('3500000'),
          maximumMonthlySpend: amount('9000000'),
        },
        rate: beforeGrant.spendingPolicy.rate,
        toolAccess: beforeGrant.spendingPolicy.toolAccess,
        toolRefs: beforeGrant.spendingPolicy.toolRefs,
      },
    })
    expect(afterFirst.oldGrant).toMatchObject({ lifecycle: 'revoked', generation: 1 })
    expect(afterFirst.oldDelegation).toMatchObject({ lifecycle: 'active', grantRef: input.grantRef })
    expect(afterFirst.currentDelegation).toMatchObject({ lifecycle: 'active', subjectPrincipalRef: principalRef })
    expect(afterFirst.credential).toMatchObject({
      credentialRef: before.credential.credentialRef,
      generation: before.credential.generation,
      lifecycle: before.credential.lifecycle,
      revision: before.credential.revision,
    })
    expect(afterFirst.events.filter(({ eventType }) => eventType === 'agent.policy_updated')).toHaveLength(1)

    await expect(owner.query(readPolicy, { principalRef })).resolves.toMatchObject({
      kind: 'current',
      generation: 2,
      grantRef: afterFirst.activeGrants[0]?.grantRef,
      spendingPolicyDigest: afterFirst.admission.spendingPolicyDigest,
      maximumSpendPerCall: amount('700000'),
      maximumDailySpend: amount('3500000'),
      maximumMonthlySpend: amount('9000000'),
    })

    await expect(owner.mutation(updatePolicy, {
      ...first,
      maximumMonthlySpend: amount('10000000'),
      correlationRef: 'corr-spending-policy-conflict',
    })).resolves.toEqual({
      kind: 'conflict',
      code: 'idempotency_conflict',
      correlationRef: 'corr-spending-policy-conflict',
    })
    await expect(owner.mutation(updatePolicy, {
      ...first,
      idempotencyKey: 'spending-policy-update-stale',
      correlationRef: 'corr-spending-policy-stale',
    })).resolves.toEqual({
      kind: 'conflict',
      code: 'revision_conflict',
      correlationRef: 'corr-spending-policy-stale',
    })

    const second = command(principalRef, {
      expectedGeneration: 2,
      idempotencyKey: 'spending-policy-update-2',
      maximumSpendPerCall: amount('800000'),
      maximumDailySpend: amount('4000000'),
      maximumMonthlySpend: amount('10000000'),
      correlationRef: 'corr-spending-policy-2',
    })
    await expect(owner.mutation(updatePolicy, second)).resolves.toMatchObject({
      kind: 'completed', generation: 3,
    })
    await expect(owner.mutation(updatePolicy, first)).resolves.toMatchObject({
      kind: 'replayed', generation: 2, grantRef: afterFirst.activeGrants[0]?.grantRef,
    })
    const finalEvents = await backend.run(async (ctx) => await ctx.db.query('auditEvents')
      .withIndex('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', (q) => q
        .eq('activeAccountRef', afterFirst.admission.ownerId)
        .eq('targetType', 'agent')
        .eq('targetRef', principalRef))
      .collect())
    expect(finalEvents.filter(({ eventType }) => eventType === 'agent.policy_updated')).toHaveLength(2)
  })

  it('refuses wrong-owner, anonymous, malformed, out-of-order, and oversized updates without authority writes', async () => {
    const backend = convexTest(schema, modules)
    const { owner, principalRef } = await provisionAgent(backend)
    const before = await backend.run(async (ctx) => ({
      admission: await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).unique(),
      grants: await ctx.db.query('agentAccessGrants').withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).collect(),
      events: await ctx.db.query('auditEvents').collect(),
    }))
    if (before.admission === null) throw new Error('spending_policy_admission_missing')
    const first = command(principalRef)

    const sibling = backend.withIdentity(identity('user_sibling'))
    await sibling.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
    await expect(sibling.mutation(updatePolicy, first)).resolves.toEqual({
      kind: 'conflict', code: 'agent_not_found', correlationRef: first.correlationRef,
    })
    await expect(backend.mutation(updatePolicy, first)).resolves.toEqual({
      kind: 'refused', code: 'authentication_required', correlationRef: first.correlationRef,
    })

    await expect(owner.mutation(updatePolicy, {
      ...first,
      idempotencyKey: 'spending-policy-invalid-units',
      maximumSpendPerCall: { currency: 'AUD', units: 'oops', exponent: 6 },
    })).resolves.toEqual({ kind: 'conflict', code: 'policy_invalid', correlationRef: first.correlationRef })
    await expect(owner.mutation(updatePolicy, {
      ...first,
      idempotencyKey: 'spending-policy-invalid-order',
      maximumSpendPerCall: amount('4000000'),
      maximumDailySpend: amount('3000000'),
    })).resolves.toEqual({ kind: 'conflict', code: 'policy_invalid', correlationRef: first.correlationRef })
    await expect(owner.mutation(updatePolicy, {
      ...first,
      idempotencyKey: 'spending-policy-invalid-range',
      maximumMonthlySpend: amount('90000000000000000'),
    })).resolves.toEqual({ kind: 'conflict', code: 'policy_invalid', correlationRef: first.correlationRef })
    await expect(owner.mutation(updatePolicy, {
      ...first,
      idempotencyKey: 'spending-policy-invalid-correlation',
      correlationRef: 'sk_live_should_not_be_accepted',
    })).resolves.toEqual({ kind: 'conflict', code: 'policy_invalid', correlationRef: 'invalid-correlation-reference' })

    const after = await backend.run(async (ctx) => ({
      admission: await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).unique(),
      grants: await ctx.db.query('agentAccessGrants').withIndex('by_principalId', (q) => q.eq('principalId', principalRef)).collect(),
      events: await ctx.db.query('auditEvents').collect(),
    }))
    expect(after.admission).toMatchObject({
      grantGeneration: before.admission.grantGeneration,
      spendingPolicyDigest: before.admission.spendingPolicyDigest,
    })
    expect(after.grants).toHaveLength(before.grants.length)
    expect(after.events).toHaveLength(before.events.length)
  })

  it('fences a planned credential replacement and lets exactly one concurrent revision win', async () => {
    const backend = convexTest(schema, modules)
    const { owner, input, principalRef } = await provisionAgent(backend)
    // Old cancelled successors must not hide a later active replacement.
    await backend.run(async (ctx) => {
      const current = await ctx.db.query('credentials')
        .withIndex('by_principalRef_and_lifecycle', q => q.eq('principalRef', principalRef).eq('lifecycle', 'active')).unique()
      if (current === null) throw new Error('spending_policy_credential_missing')
      const { _id: _ignoredId, _creationTime: _ignoredTime, ...credential } = current
      for (const suffix of ['one', 'two']) {
        await ctx.db.insert('credentials', {
          ...credential, credentialRef: `cred_cancelled_${suffix}`,
          predecessorCredentialRef: current.credentialRef, lifecycle: 'revoked',
        })
      }
    })
    const replacement: AgentCredentialReplacementRegistration = {
      principalRef,
      replacementMode: 'planned',
      issuanceKey: 'spending-policy-replacement-12345678',
      grantRef: issuedAgentGrantRef('user_owner', 'spending-policy-replacement-12345678'),
      credentialId: 'key_spending_policy_replacement',
      applicationRef: input.applicationRef,
      environment: input.environment,
      scopes: [...input.scopes],
      authorityMode: input.authorityMode,
      toolAccess: input.toolAccess,
      toolRefs: [...input.toolRefs],
      spendingPolicy: input.spendingPolicy,
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }
    await expect(owner.mutation(prepareReplacement, {
      ...replacement,
      serviceAuth: await serviceAssertion(PREPARE_REPLACEMENT_OPERATION, {
        ...replacement,
        scopes: [...replacement.scopes],
        toolRefs: [...replacement.toolRefs],
      }),
    })).resolves.toMatchObject({ kind: 'recorded' })
    await expect(owner.mutation(updatePolicy, command(principalRef))).resolves.toEqual({
      kind: 'conflict',
      code: 'credential_replacement_pending',
      correlationRef: 'corr-spending-policy-1',
    })

    const concurrentBackend = convexTest(schema, modules)
    const concurrent = await provisionAgent(concurrentBackend)
    const left = command(concurrent.principalRef, {
      idempotencyKey: 'spending-policy-concurrent-left',
      maximumSpendPerCall: amount('600000'),
      maximumDailySpend: amount('3000000'),
      maximumMonthlySpend: amount('8000000'),
      correlationRef: 'corr-spending-policy-left',
    })
    const right = command(concurrent.principalRef, {
      idempotencyKey: 'spending-policy-concurrent-right',
      maximumSpendPerCall: amount('500000'),
      maximumDailySpend: amount('2500000'),
      maximumMonthlySpend: amount('7000000'),
      correlationRef: 'corr-spending-policy-right',
    })
    const [leftResult, rightResult] = await Promise.all([
      concurrent.owner.mutation(updatePolicy, left),
      concurrent.owner.mutation(updatePolicy, right),
    ])
    expect([leftResult.kind, rightResult.kind].sort()).toEqual(['completed', 'conflict'])
    expect([leftResult, rightResult].find((result) => result.kind === 'conflict')).toMatchObject({
      code: 'revision_conflict',
    })
    const concurrentState = await concurrentBackend.run(async (ctx) => ({
      grants: await ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (q) => q
          .eq('credentialId', concurrent.input.credentialId)
          .eq('environment', concurrent.input.environment)
          .eq('lifecycle', 'active'))
        .collect(),
      delegations: await ctx.db.query('authorityDelegationGrants').collect(),
      events: await ctx.db.query('auditEvents').collect(),
    }))
    expect(concurrentState.grants).toHaveLength(1)
    expect(concurrentState.delegations).toHaveLength(2)
    expect(concurrentState.events.filter(({ eventType }) => eventType === 'agent.policy_updated')).toHaveLength(1)
  })
})
