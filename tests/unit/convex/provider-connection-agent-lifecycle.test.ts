import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const SERVICE_KEY = 'supplier-provider-connection-test-key-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'

const registerBinding = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
const connectX402 = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:connectX402',
)
const listConnections = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:list',
)
const readConnection = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:read',
)
const reconnectConnection = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:reconnect',
)
const revokeConnection = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:revoke',
)
const retryCleanup = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'capabilityProviderConnectionAgents:retryCleanup',
)

async function issueSupplierAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
): Promise<AgentAccessPrincipal> {
  const now = Date.now()
  const issuanceKey = `supplier-provider-${subject}`
  const input = {
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId: `credential:${subject}`,
    displayName: 'Supplier provider manager',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_supply:manage'],
    authorityMode: 'bounded_mandate' as const,
    policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    createdAt: now,
    expiresAt: now + 600_000,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: REGISTER_OPERATION,
    command: toStableHashValue({ ...input, scopes: [...input.scopes] }),
    principal: {
      principalId: 'ae:server-function',
      ownerId: 'ae:server-function',
      credentialId: 'ae:server-function',
      scopes: ['market_operations:invoke'],
    },
    issuedAt: now,
  })
  const result = await owner.mutation(registerBinding, { ...input, serviceAuth })
  if (result.kind !== 'recorded' && result.kind !== 'replayed') {
    throw new Error(`supplier_binding_failed:${String(result.kind)}`)
  }
  const stored = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialId))
    .unique())
  if (stored === null) throw new Error('supplier_principal_missing')
  return {
    principalId: stored.principalId,
    ownerId: stored.ownerId,
    credentialId: stored.credentialId,
    applicationRef: stored.applicationRef,
    environment: stored.environment,
    scopes: [...stored.scopes],
    authorityMode: stored.authorityMode,
  }
}

async function agentCommand(
  backend: ConvexFixtureBackend,
  reference: typeof connectX402,
  input: Record<string, unknown>,
) {
  return await backend.mutation(reference, await withSourceWrite('catalog_publish', input as never))
}

describe('supplier-agent provider connection lifecycle', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('lists, inspects, reconnects, revokes, and preserves recovery state under one issued supplier grant', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-provider-lifecycle')
    const principal = await issueSupplierAgent(backend, fixture.owner, 'user_agent-provider-lifecycle')
    const base = { agentPrincipal: principal }

    const connectOperationKey = 'supplier-connection:connect:one'
    const connected = await agentCommand(backend, connectX402, {
      ...base,
      businessId: fixture.businessId,
      resourceUrl: 'https://provider.example/x402',
      evidenceRefs: ['evidence:supplier-connect'],
      commandId: connectOperationKey,
      operationKey: connectOperationKey,
      correlationId: connectOperationKey,
    })
    expect(connected).toMatchObject({
      kind: 'applied',
      connection: { businessId: String(fixture.businessId), lifecycle: 'active', available: true },
    })
    const connection = connected.connection as Record<string, unknown>
    const connectionRef = String(connection.connectionRef)

    const listOperationKey = 'supplier-connection:list:one'
    await expect(agentCommand(backend, listConnections, {
      ...base,
      businessId: fixture.businessId,
      limit: 100,
      operationKey: listOperationKey,
      correlationId: listOperationKey,
    })).resolves.toMatchObject({
      kind: 'available',
      connections: [{ connectionRef, lifecycle: 'active' }],
    })

    const readOperationKey = 'supplier-connection:read:one'
    await expect(agentCommand(backend, readConnection, {
      ...base,
      connectionRef,
      operationKey: readOperationKey,
      correlationId: readOperationKey,
    })).resolves.toMatchObject({ kind: 'found', connection: { connectionRef } })

    const staleOperationKey = 'supplier-connection:reconnect:stale'
    await expect(agentCommand(backend, reconnectConnection, {
      ...base,
      connectionRef,
      expectedAuthorityGeneration: Number(connection.authorityGeneration) + 1,
      expectedAuthorityDigest: String(connection.authorityDigest),
      evidenceRefs: [],
      commandId: staleOperationKey,
      operationKey: staleOperationKey,
      correlationId: staleOperationKey,
    })).resolves.toMatchObject({ kind: 'refused', code: 'invalid_generation' })

    const reconnectOperationKey = 'supplier-connection:reconnect:one'
    const reconnected = await agentCommand(backend, reconnectConnection, {
      ...base,
      connectionRef,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
      evidenceRefs: ['evidence:supplier-reconnect'],
      commandId: reconnectOperationKey,
      operationKey: reconnectOperationKey,
      correlationId: reconnectOperationKey,
    })
    expect(reconnected).toMatchObject({ kind: 'applied', connection: { connectionRef, lifecycle: 'active' } })
    const refreshed = reconnected.connection as Record<string, unknown>

    const revokeOperationKey = 'supplier-connection:revoke:one'
    const revoked = await agentCommand(backend, revokeConnection, {
      ...base,
      connectionRef,
      expectedAuthorityGeneration: refreshed.authorityGeneration,
      expectedAuthorityDigest: refreshed.authorityDigest,
      reasonCode: 'supplier_requested',
      evidenceRefs: ['evidence:supplier-revoke'],
      commandId: revokeOperationKey,
      operationKey: revokeOperationKey,
      correlationId: revokeOperationKey,
    })
    expect(revoked).toMatchObject({ kind: 'applied', connection: { connectionRef, lifecycle: 'revocation_pending', available: false } })

    const recoveryReadKey = 'supplier-connection:read:recovery'
    await expect(agentCommand(backend, readConnection, {
      ...base,
      connectionRef,
      operationKey: recoveryReadKey,
      correlationId: recoveryReadKey,
    })).resolves.toMatchObject({
      kind: 'found',
      connection: { connectionRef, lifecycle: 'revocation_pending' },
    })

    const cleanupOperationKey = 'supplier-connection:cleanup:too-soon'
    await expect(agentCommand(backend, retryCleanup, {
      ...base,
      connectionRef,
      commandId: cleanupOperationKey,
      operationKey: cleanupOperationKey,
      correlationId: cleanupOperationKey,
    })).resolves.toMatchObject({ kind: 'refused', code: 'invalid_transition' })
  })

  it('fails closed for missing source admission and a sibling owner business', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-provider-owner')
    const sibling = await publishedBusinessOwner(backend, 'agent-provider-sibling')
    const principal = await issueSupplierAgent(backend, fixture.owner, 'user_agent-provider-owner')
    const unsigned = {
      businessId: fixture.businessId as Id<'businesses'>,
      limit: 100,
      agentPrincipal: principal,
      operationKey: 'supplier-connection:list:unsigned',
      correlationId: 'supplier-connection:list:unsigned',
    }
    await expect(backend.mutation(listConnections, unsigned)).resolves.toEqual({
      kind: 'error',
      code: 'unauthenticated',
    })

    const siblingOperationKey = 'supplier-connection:list:sibling'
    await expect(agentCommand(backend, listConnections, {
      ...unsigned,
      businessId: sibling.businessId,
      operationKey: siblingOperationKey,
      correlationId: siblingOperationKey,
    })).resolves.toEqual({ kind: 'not_found' })
  })
})
