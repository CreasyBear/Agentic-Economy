/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { makeFunctionReference } from 'convex/server'
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
  type StoredAgentAccessGrant,
} from '../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../src/modules/agent-access/sandbox-policy'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const SERVICE_KEY = 'agent-access-server-function-key-that-is-at-least-32-bytes'
const SERVER_SCOPE = 'market_operations:invoke'

type RegisterArgs = Readonly<{ grant: AgentAccessGrant; serviceAuth: CustomerRequestServiceAssertion }>
type GrantWriteResult = Readonly<Record<string, unknown>>
type Backend = TestConvex<typeof schema>

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
    operationAccess: 'all_admitted',
    authorityMode: 'inspect_only',
    policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
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

const operationRef = (value: string) => `operation:v1:${value.repeat(64)}`

function selectedGrant(operationRefs: readonly string[], overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrant {
  const base = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  return grant({
    operationAccess: 'selected_operations',
    operationRefs,
    policy: {
      ...base,
      operationAccess: 'selected_operations',
      operationRefs: [...operationRefs],
    },
    ...overrides,
  })
}

function legacyStoredGrant(): StoredAgentAccessGrant {
  const current = grant()
  const {
    format: _policyFormat,
    operationAccess: _policyOperationAccess,
    operationRefs: _policyOperationRefs,
    ...policyMaterial
  } = current.policy
  const legacyPolicy = {
    ...policyMaterial,
    format: LEGACY_AGENT_ACCESS_POLICY_FORMAT,
    operationAccess: 'all_admitted',
  } satisfies LegacyAgentAccessPolicy
  const {
    format: _grantFormat,
    operationAccess: _grantOperationAccess,
    operationRefs: _grantOperationRefs,
    policy: _policy,
    policyDigest: _policyDigest,
    ...grantMaterial
  } = current
  return {
    ...grantMaterial,
    format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
    operationAccess: 'all_admitted',
    policy: legacyPolicy,
    policyDigest: canonicalDigest(legacyPolicy as never),
  }
}

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
      policyDigest: current.policyDigest,
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
      .resolves.toMatchObject({ kind: 'recorded', grantRef: current.grantRef, generation: current.generation })
  })

  it('reads legacy v1 rows with derived selection while preserving v1 format and digest', async () => {
    const backend = convexTest(schema, modules)
    const legacy = legacyStoredGrant()
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessGrants', legacy)
    })

    await expect(backend.query(readGrant, { grantRef: legacy.grantRef })).resolves.toMatchObject({
      format: LEGACY_AGENT_ACCESS_GRANT_FORMAT,
      operationAccess: 'all_admitted',
      operationRefs: [],
      policy: { format: LEGACY_AGENT_ACCESS_POLICY_FORMAT, operationAccess: 'all_admitted' },
      policyDigest: legacy.policyDigest,
    })
    const normalized = await backend.query(readGrant, { grantRef: legacy.grantRef })
    expect(normalized).not.toBeNull()
    if (normalized === null) return
    expect('operationRefs' in normalized.policy).toBe(false)
    expect(canonicalDigest(normalized.policy as never)).toBe(normalized.policyDigest)
  })

  it('rejects all four hybrid stored grant shapes at the schema boundary', async () => {
    const legacy = legacyStoredGrant()
    const current = grant()
    const { operationRefs: _topLevelRefs, ...v2WithoutTopLevelRefs } = current
    const { operationRefs: _policyRefs, ...v2PolicyWithoutRefs } = current.policy
    const hybrids = [
      { ...legacy, operationRefs: [] },
      { ...legacy, policy: { ...legacy.policy, operationRefs: [] } },
      v2WithoutTopLevelRefs,
      { ...current, policy: v2PolicyWithoutRefs },
    ]

    for (const hybrid of hybrids) {
      const backend = convexTest(schema, modules)
      await expect(backend.run(async (ctx) => await ctx.db.insert('agentAccessGrants', hybrid as never)))
        .rejects.toThrow()
    }
  })

  it('replays the same selected-operation material and conflicts when references change', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const firstRef = operationRef('a')
    const secondRef = operationRef('b')
    const current = selectedGrant([firstRef, secondRef])
    const reordered = {
      ...current,
      operationRefs: [secondRef, firstRef],
      policy: { ...current.policy, operationRefs: [secondRef, firstRef] },
    }
    await seedCanonicalPrincipal(backend, current)
    const reorderedAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: reordered }, current)

    await expect(backend.mutation(registerGrantForServer, { grant: reordered, serviceAuth: reorderedAssertion }))
      .resolves.toMatchObject({ kind: 'recorded' })
    const canonicalAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: current }, current)
    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: canonicalAssertion }))
      .resolves.toMatchObject({ kind: 'replayed' })

    const changed = selectedGrant([firstRef, operationRef('c')])
    const changedAssertion = await serviceAuth('agentAccessPolicy.registerGrantForServer', { grant: changed }, changed)
    await expect(backend.mutation(registerGrantForServer, { grant: changed, serviceAuth: changedAssertion }))
      .resolves.toEqual({ kind: 'conflict', code: 'grant_exists' })
  })

})
