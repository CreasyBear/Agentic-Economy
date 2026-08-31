/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { makeFunctionReference } from 'convex/server'
import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/agent-access/service-auth-envelope'
import {
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
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

})
