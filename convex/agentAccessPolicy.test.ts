/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { makeFunctionReference } from 'convex/server'
import { createCustomerRequestServiceAssertion, toStableHashValue, type CustomerRequestServiceAssertion } from '../src/modules/customer-request/service-auth-envelope'
import {
  createAgentAccessGrant,
  defaultAgentAccessPolicy,
  type AgentAccessGrant,
  type AgentAccessGrantInput,
} from '../src/modules/agent-access/policy'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const SERVICE_KEY = 'agent-access-server-function-key-that-is-at-least-32-bytes'
const SERVER_SCOPE = 'market_operations:invoke'

type RegisterArgs = Readonly<{ grant: AgentAccessGrant; serviceAuth: CustomerRequestServiceAssertion }>
type RevokeArgs = Readonly<{
  grantRef: string
  ownerId: string
  credentialId: string
  principalId: string
  updatedAt: number
  serviceAuth: CustomerRequestServiceAssertion
}>
type GrantWriteResult = Readonly<Record<string, unknown>>

const registerGrantForServer = makeFunctionReference<'mutation', RegisterArgs, GrantWriteResult>('agentAccessPolicy:registerGrantForServer')
const revokeGrantForServer = makeFunctionReference<'mutation', RevokeArgs, GrantWriteResult>('agentAccessPolicy:revokeGrantForServer')

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
    policy: defaultAgentAccessPolicy({ environment: 'sandbox', currency: 'USD', exponent: 2 }),
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

describe('agent access Convex server grant wrappers', () => {
  it('requires the server token and exact grant principal binding', async () => {
    const backend = convexTest(schema, modules)
    const current = grant()
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

  it('row-binds revoke, preserves durable lifecycle idempotency, and refuses forged command bodies', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
    const backend = convexTest(schema, modules)
    const current = grant()
    const registerCommand = { grant: current }
    const registerAuth = await serviceAuth('agentAccessPolicy.registerGrantForServer', registerCommand, current)
    await expect(backend.mutation(registerGrantForServer, { grant: current, serviceAuth: registerAuth }))
      .resolves.toMatchObject({ kind: 'recorded' })

    const wrongRevoke = {
      grantRef: current.grantRef,
      ownerId: current.ownerId,
      credentialId: 'key_other',
      principalId: current.principalId,
      updatedAt: 2_000,
    }
    const wrongAuth = await serviceAuth('agentAccessPolicy.revokeGrantForServer', wrongRevoke, {
      principalId: wrongRevoke.principalId,
      ownerId: wrongRevoke.ownerId,
      credentialId: wrongRevoke.credentialId,
    })
    await expect(backend.mutation(revokeGrantForServer, { ...wrongRevoke, serviceAuth: wrongAuth }))
      .resolves.toEqual({ kind: 'binding_mismatch', grantRef: current.grantRef })

    const validRevoke = {
      grantRef: current.grantRef,
      ownerId: current.ownerId,
      credentialId: current.credentialId,
      principalId: current.principalId,
      updatedAt: 3_000,
    }
    const validAuth = await serviceAuth('agentAccessPolicy.revokeGrantForServer', validRevoke, current)
    await expect(backend.mutation(revokeGrantForServer, { ...validRevoke, serviceAuth: validAuth }))
      .resolves.toEqual({ kind: 'revoked', grantRef: current.grantRef, generation: current.generation })
    await expect(backend.mutation(revokeGrantForServer, { ...validRevoke, serviceAuth: validAuth }))
      .resolves.toEqual({ kind: 'already_revoked', grantRef: current.grantRef, generation: current.generation })

    const stored = await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', current.grantRef)).unique())
    expect(stored).toMatchObject({ lifecycle: 'revoked', updatedAt: validRevoke.updatedAt })
  })
})
