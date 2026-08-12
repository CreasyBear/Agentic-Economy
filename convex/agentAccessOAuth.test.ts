/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
} from '../src/modules/security/source-write-admission'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const SOURCE_WRITE_SECRET = 'oauth-local-source-write-secret-material-32'
const SOURCE_REQUEST = {
  method: 'POST',
  initiatorOrigin: 'https://ae.example',
  targetOrigin: 'https://ae.example',
  targetPath: '/oauth/token',
  targetQuery: '',
} as const

const sourceArgs = async (
  command: Readonly<Record<string, unknown>> & Readonly<{ operationKey: string; correlationId: string }>,
  nonce = command.operationKey,
) => {
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: { ...SOURCE_REQUEST, bodyDigest: sourceWriteCommandBodyDigest(command) },
    scope: 'agent_identity',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
  })
  return {
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  }
}

const previousSourceWriteSecret = process.env.AE_SOURCE_WRITE_SECRET

afterEach(() => {
  if (previousSourceWriteSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
  else process.env.AE_SOURCE_WRITE_SECRET = previousSourceWriteSecret
})

const grant = {
  grantRef: 'device:convex-cas',
  flow: 'device_code' as const,
  clientId: 'client-convex',
  requestedScopes: ['customer_requests:create', 'customer_requests:inspect_only'],
  deviceCodeHash: 'device-hash',
  userCodeHash: 'user-hash',
  status: 'pending' as const,
  createdAt: 1_000,
  expiresAt: 601_000,
  nextPollAt: 1_000,
  displayName: 'Convex persistence test',
}

describe('Agent Access OAuth Convex persistence adapter', () => {
  it('rejects direct unauthenticated grant writes and hash/ref reads without a source envelope', async () => {
    delete process.env.AE_SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(api.agentAccessOAuth.insertGrant, {
      grant,
      operationKey: 'oauth:test:unauthenticated',
      correlationId: 'oauth:test:unauthenticated',
    })).rejects.toThrow('agent_access_oauth_source_write_rejected:missing_source_write_admission')
    await expect(backend.query(api.agentAccessOAuth.getGrantByHash, {
      kind: 'device',
      hash: grant.deviceCodeHash,
      operationKey: 'oauth:grant:device:device-hash:read',
      correlationId: 'oauth:grant:device:device-hash:read',
    })).rejects.toThrow('oauth_source_read_rejected')
    await expect(backend.query(api.agentAccessOAuth.getGrantByRef, {
      grantRef: grant.grantRef,
      operationKey: 'oauth:test:unauthenticated-read',
      correlationId: 'oauth:test:unauthenticated-read',
    })).rejects.toThrow('oauth_source_read_rejected')
  })

  it('persists full machine state, enforces CAS, and freezes authority fields after approval', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:insert',
      correlationId: 'oauth:test:insert',
    }
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })
    const readCommand = {
      grantRef: grant.grantRef,
      operationKey: 'oauth:test:read',
      correlationId: 'oauth:test:read',
    }
    const stored = await backend.query(api.agentAccessOAuth.getGrantByRef, {
      ...readCommand,
      ...(await sourceArgs(readCommand)),
    })
    expect(stored).toMatchObject(grant)
    const hashReadOperationKey = `oauth:grant:device:${grant.deviceCodeHash}:read`
    const hashReadCommand = {
      kind: 'device' as const,
      hash: grant.deviceCodeHash,
      operationKey: hashReadOperationKey,
      correlationId: hashReadOperationKey,
    }
    const hashRead = await backend.query(api.agentAccessOAuth.getGrantByHash, {
      ...hashReadCommand,
      ...(await sourceArgs(hashReadCommand, 'oauth:test:hash-read')),
    })
    expect(hashRead).toMatchObject(grant)

    const crossSourceCommand = hashReadCommand
    const crossSourceAdmission = await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request: { ...SOURCE_REQUEST, bodyDigest: sourceWriteCommandBodyDigest(crossSourceCommand) },
      scope: 'billing',
      operationKey: crossSourceCommand.operationKey,
      correlationId: crossSourceCommand.correlationId,
      commandDigest: sourceWriteCommandDigest(crossSourceCommand),
      nonce: 'oauth:test:cross-source',
    })
    await expect(backend.query(api.agentAccessOAuth.getGrantByHash, {
      ...crossSourceCommand,
      sourceWriteRequest: sourceWriteRequestFromAdmission(crossSourceAdmission),
      sourceWrite: crossSourceAdmission,
    })).rejects.toThrow('oauth_source_read_rejected')

    const tamperedSource = await sourceArgs(hashReadCommand, 'oauth:test:tampered')
    await expect(backend.query(api.agentAccessOAuth.getGrantByHash, {
      ...hashReadCommand,
      sourceWriteRequest: tamperedSource.sourceWriteRequest,
      sourceWrite: { ...tamperedSource.sourceWrite, signature: '0'.repeat(tamperedSource.sourceWrite.signature.length) },
    })).rejects.toThrow('oauth_source_read_rejected')
    const firstCommand = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      patch: { status: 'approved' as const, ownerId: 'owner-convex', keyId: 'key-convex', approvedAt: 1_001 },
      operationKey: 'oauth:test:approve',
      correlationId: 'oauth:test:approve',
    }
    const first = await backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...firstCommand,
      ...(await sourceArgs(firstCommand)),
    })
    const secondCommand = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      patch: { status: 'approved' as const, ownerId: 'owner-race', keyId: 'key-race', approvedAt: 1_002 },
      operationKey: 'oauth:test:cas-race',
      correlationId: 'oauth:test:cas-race',
    }
    const second = await backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...secondCommand,
      ...(await sourceArgs(secondCommand)),
    })
    expect(first).toMatchObject({ status: 'approved', ownerId: 'owner-convex' })
    expect(second).toBeNull()

    const scopeMutationCommand = {
      grantRef: grant.grantRef,
      expectedStatus: 'approved' as const,
      patch: { requestedScopes: ['customer_requests:create', 'customer_requests:full_yolo'] },
      operationKey: 'oauth:test:scope-mutation',
      correlationId: 'oauth:test:scope-mutation',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...scopeMutationCommand,
      ...(await sourceArgs(scopeMutationCommand)),
    })).rejects.toThrow('oauth_grant_immutable_after_approval')
  })
})

describe('Agent Access OAuth grant cleanup', () => {
  afterEach(() => vi.useRealTimers())

  it('removes old expired and consumed grants while retaining live grants and clients', async () => {
    const backend = convexTest(schema, modules)
    const now = 10 * 24 * 60 * 60 * 1_000

    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessOAuthGrants', cleanupGrant('grant:expired', 'expired', 1_000))
      await ctx.db.insert('agentAccessOAuthGrants', cleanupGrant('grant:consumed', 'consumed', 2_000))
      await ctx.db.insert('agentAccessOAuthGrants', cleanupGrant('grant:live', 'pending', now))
      await ctx.db.insert('agentAccessOAuthClients', {
        clientId: 'client:retained',
        clientName: 'Retained client',
        redirectUris: [],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none',
        createdAt: 1_000,
      })
    })

    const result = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, { now, batchSize: 10 })

    expect(result.deleted).toBe(2)
    expect(result.rescheduled).toBe(false)
    expect(result.cutoff).toBeLessThan(now)

    const remaining = await backend.run(async (ctx) => ({
      grants: await ctx.db.query('agentAccessOAuthGrants').take(10),
      client: await ctx.db.query('agentAccessOAuthClients')
        .withIndex('by_clientId', (query) => query.eq('clientId', 'client:retained'))
        .unique(),
    }))
    expect(remaining.grants.map(({ grantRef }) => grantRef)).toEqual(['grant:live'])
    expect(remaining.client?.clientId).toBe('client:retained')
  })

  it('reschedules a full bounded batch until all old grants are drained', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, modules)
    const now = 10 * 24 * 60 * 60 * 1_000

    await backend.run(async (ctx) => {
      const statuses: Array<'expired' | 'consumed'> = ['expired', 'consumed', 'expired']
      for (const [index, status] of statuses.entries()) {
        await ctx.db.insert('agentAccessOAuthGrants', cleanupGrant(`grant:old-${index}`, status, index + 1))
      }
    })

    const first = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, { now, batchSize: 2 })

    expect(first).toMatchObject({ deleted: 2, rescheduled: true })
    await backend.finishAllScheduledFunctions(vi.runAllTimers)

    const remaining = await backend.run(async (ctx) => await ctx.db.query('agentAccessOAuthGrants').take(10))
    expect(remaining).toEqual([])
  })
})

function cleanupGrant(
  grantRef: string,
  status: 'pending' | 'consumed' | 'expired',
  expiresAt: number,
) {
  return {
    grantRef,
    flow: 'device_code' as const,
    clientId: 'client:cleanup',
    requestedScopes: ['customer_requests:create'],
    status,
    createdAt: 0,
    expiresAt,
    displayName: 'Cleanup test',
  }
}
