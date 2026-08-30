/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
} from '../src/modules/security/source-write-admission'
import { api, internal } from './_generated/api'
import schema from './schema'
import {
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
  type WorkloadCronSnapshot,
} from './workloadCron'

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
  requestedScopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
  requestedAccess: {
    environment: 'production' as const,
    maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '5000', exponent: 2 },
    maximumConcurrentInvocations: 2,
    maximumCallsPerMinute: 10,
    maximumCallsPerHour: 100,
    expiresInSeconds: 86_400,
  },
  deviceCodeHash: 'device-hash',
  userCodeHash: 'user-hash',
  authorizationCodeHash: 'authorization-hash',
  status: 'pending' as const,
  createdAt: 1_000,
  expiresAt: 601_000,
  nextPollAt: 1_000,
  displayName: 'Convex persistence test',
}

const client = {
  clientId: 'client-convex',
  clientName: 'Convex persistence client',
  redirectUris: ['https://ae.example/callback'],
  grantTypes: [
    'authorization_code',
    'urn:ietf:params:oauth:grant-type:device_code',
  ] satisfies Array<'authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code'>,
  tokenEndpointAuthMethod: 'none' as const,
  createdAt: 1_000,
}
const cleanupRequestedAccess = {
  environment: 'sandbox' as const,
  expiresInSeconds: 600,
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
    await expect(backend.mutation(api.agentAccessOAuth.insertClient, {
      client,
      operationKey: 'oauth:test:unauthenticated-client',
      correlationId: 'oauth:test:unauthenticated-client',
    })).rejects.toThrow('agent_access_oauth_source_write_rejected:missing_source_write_admission')
  })

  it('inserts and reads a grant by reference and each exact hash index', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:insert-read',
      correlationId: 'oauth:test:insert-read',
    }
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand, 'nonce:oauth:test:insert-read')),
    })

    const refCommand = {
      grantRef: grant.grantRef,
      operationKey: 'oauth:test:read-ref',
      correlationId: 'oauth:test:read-ref',
    }
    await expect(backend.query(api.agentAccessOAuth.getGrantByRef, {
      ...refCommand,
      ...(await sourceArgs(refCommand)),
    })).resolves.toEqual(grant)

    for (const [kind, hash] of [
      ['device', grant.deviceCodeHash],
      ['user', grant.userCodeHash],
      ['authorization', grant.authorizationCodeHash],
    ] as const) {
      const readCommand = {
        kind,
        hash,
        operationKey: `oauth:test:read-hash:${kind}`,
        correlationId: `oauth:test:read-hash:${kind}`,
      }
      await expect(backend.query(api.agentAccessOAuth.getGrantByHash, {
        ...readCommand,
        ...(await sourceArgs(readCommand)),
      })).resolves.toEqual(grant)
    }
  })

  it('replays exact grants and rejects conflicting references or hashes', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:grant-replay',
      correlationId: 'oauth:test:grant-replay',
    }

    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand, 'nonce:oauth:test:grant-first')),
    })
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand, 'nonce:oauth:test:grant-replay')),
    })

    const rows = await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect())
    expect(rows).toHaveLength(1)

    const conflictingRef = {
      grant: {
        ...grant,
        requestedAccess: { ...grant.requestedAccess, expiresInSeconds: grant.requestedAccess.expiresInSeconds + 1 },
      },
      operationKey: 'oauth:test:grant-conflicting-ref',
      correlationId: 'oauth:test:grant-conflicting-ref',
    }
    await expect(backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...conflictingRef,
      ...(await sourceArgs(conflictingRef)),
    })).rejects.toThrow('agent_access_oauth_grant_conflict')

    const conflictingHash = {
      grant: { ...grant, grantRef: 'device:convex-hash-conflict', userCodeHash: 'other-user-hash', authorizationCodeHash: 'other-authorization-hash' },
      operationKey: 'oauth:test:grant-conflicting-hash',
      correlationId: 'oauth:test:grant-conflicting-hash',
    }
    await expect(backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...conflictingHash,
      ...(await sourceArgs(conflictingHash)),
    })).rejects.toThrow('agent_access_oauth_grant_conflict')
  })

  it('applies grant updates with first-writer CAS semantics', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:cas-insert',
      correlationId: 'oauth:test:cas-insert',
    }
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })

    const firstUpdate = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      patch: { status: 'approved' as const, ownerId: 'owner:convex', approvedAt: 2_000 },
      operationKey: 'oauth:test:cas-first',
      correlationId: 'oauth:test:cas-first',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...firstUpdate,
      ...(await sourceArgs(firstUpdate)),
    })).resolves.toMatchObject({
      grantRef: grant.grantRef,
      status: 'approved',
      ownerId: 'owner:convex',
      approvedAt: 2_000,
    })

    const staleUpdate = {
      ...firstUpdate,
      patch: { status: 'denied' as const, denialReason: 'access_denied' as const },
      operationKey: 'oauth:test:cas-stale',
      correlationId: 'oauth:test:cas-stale',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...staleUpdate,
      ...(await sourceArgs(staleUpdate)),
    })).resolves.toBeNull()
  })

  it('replays exact clients and rejects conflicting client material', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      client,
      operationKey: 'oauth:test:client-replay',
      correlationId: 'oauth:test:client-replay',
    }

    await backend.mutation(api.agentAccessOAuth.insertClient, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand, 'nonce:oauth:test:client-first')),
    })
    await backend.mutation(api.agentAccessOAuth.insertClient, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand, 'nonce:oauth:test:client-replay')),
    })

    await expect(backend.query(api.agentAccessOAuth.getClient, { clientId: client.clientId }))
      .resolves.toEqual(client)
    const rows = await backend.run((ctx) => ctx.db.query('agentAccessOAuthClients').collect())
    expect(rows).toHaveLength(1)

    const conflictingClient = {
      client: { ...client, clientName: 'Conflicting client material' },
      operationKey: 'oauth:test:client-conflict',
      correlationId: 'oauth:test:client-conflict',
    }
    await expect(backend.mutation(api.agentAccessOAuth.insertClient, {
      ...conflictingClient,
      ...(await sourceArgs(conflictingClient)),
    })).rejects.toThrow('agent_access_oauth_client_conflict')
  })

  it('keeps OAuth client metadata public while grants remain source-admitted', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      client,
      operationKey: 'oauth:test:public-client-metadata',
      correlationId: 'oauth:test:public-client-metadata',
    }
    await backend.mutation(api.agentAccessOAuth.insertClient, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })

    const anonymous = await backend.query(api.agentAccessOAuth.getClient, {
      clientId: client.clientId,
    })
    const identified = await backend.withIdentity({
      subject: 'caller-shaped-owner',
      issuer: 'https://identity.example',
      tokenIdentifier: 'https://identity.example|caller-shaped-owner',
    }).query(api.agentAccessOAuth.getClient, { clientId: client.clientId })

    expect(identified).toEqual(anonymous)
    expect(anonymous).toEqual(client)
    expect(JSON.stringify(anonymous)).not.toMatch(/grantRef|deviceCode|authorizationCode|secret/u)
  })
})

describe('Agent Access OAuth grant cleanup', () => {
  it('deletes expired grants across statuses while preserving the one-hour grace window', async () => {
    const backend = convexTest(schema, modules)
    const workload = await admitOAuthCleanupWorkload(backend)
    const now = 10_000_000
    const cutoff = now - 60 * 60 * 1_000
    const statuses = ['pending', 'approved', 'denied', 'delivery_claimed', 'consumed', 'expired'] as const
    await backend.run(async (ctx) => {
      for (const [index, status] of statuses.entries()) {
        await ctx.db.insert('agentAccessOAuthGrants', {
          grantRef: `cleanup:expired:${status}`,
          flow: 'device_code',
          clientId: 'cleanup-client',
          requestedScopes: [],
          requestedAccess: cleanupRequestedAccess,
          status,
          createdAt: 1,
          expiresAt: cutoff - index - 1,
          displayName: 'Cleanup expired',
        })
      }
      await ctx.db.insert('agentAccessOAuthGrants', {
        grantRef: 'cleanup:grace',
        flow: 'device_code',
        clientId: 'cleanup-client',
        requestedScopes: [],
        requestedAccess: cleanupRequestedAccess,
        status: 'pending',
        createdAt: 1,
        expiresAt: cutoff + 1,
        displayName: 'Cleanup grace',
      })
    })

    await expect(backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 10,
    } as never)).rejects.toThrow(/Missing required field `workload`/u)
    await expect(backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 10,
      workload: { ...workload, actorPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' },
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect()))
      .toHaveLength(7)

    const result = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 10,
      workload,
    })
    expect(result).toEqual({ deleted: 6, cutoff, rescheduled: false })
    const remaining = await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect())
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toMatchObject({ grantRef: 'cleanup:grace', expiresAt: cutoff + 1 })
  })

  it('caps cleanup batches at 200 rows', async () => {
    const backend = convexTest(schema, modules)
    const workload = await admitOAuthCleanupWorkload(backend)
    const now = 20_000_000
    const cutoff = now - 60 * 60 * 1_000
    await backend.run(async (ctx) => {
      for (let index = 0; index < 205; index += 1) {
        await ctx.db.insert('agentAccessOAuthGrants', {
          grantRef: `cleanup:cap:${index}`,
          flow: 'device_code',
          clientId: 'cleanup-client',
          requestedScopes: [],
          requestedAccess: cleanupRequestedAccess,
          status: 'pending',
          createdAt: 1,
          expiresAt: cutoff - index - 1,
          displayName: 'Cleanup cap',
        })
      }
    })

    const result = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 999,
      workload,
    })
    expect(result).toEqual({ deleted: 200, cutoff, rescheduled: true })
  })

  it('reschedules only when a cleanup batch is full', async () => {
    const fullBackend = convexTest(schema, modules)
    const fullWorkload = await admitOAuthCleanupWorkload(fullBackend)
    const now = 30_000_000
    const cutoff = now - 60 * 60 * 1_000
    await fullBackend.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert('agentAccessOAuthGrants', {
          grantRef: `cleanup:full:${index}`,
          flow: 'device_code',
          clientId: 'cleanup-client',
          requestedScopes: [],
          requestedAccess: cleanupRequestedAccess,
          status: 'pending',
          createdAt: 1,
          expiresAt: cutoff - index - 1,
          displayName: 'Cleanup full',
        })
      }
    })
    await expect(fullBackend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 2,
      workload: fullWorkload,
    }))
      .resolves.toMatchObject({ deleted: 2, rescheduled: true })

    const partialBackend = convexTest(schema, modules)
    const partialWorkload = await admitOAuthCleanupWorkload(partialBackend)
    await partialBackend.run(async (ctx) => {
      await ctx.db.insert('agentAccessOAuthGrants', {
        grantRef: 'cleanup:partial',
        flow: 'device_code',
        clientId: 'cleanup-client',
        requestedScopes: [],
        requestedAccess: cleanupRequestedAccess,
        status: 'pending',
        createdAt: 1,
        expiresAt: cutoff - 1,
        displayName: 'Cleanup partial',
      })
    })
    await expect(partialBackend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 2,
      workload: partialWorkload,
    }))
      .resolves.toMatchObject({ deleted: 1, rescheduled: false })
  })
})

async function admitOAuthCleanupWorkload(
  backend: TestConvex<typeof schema>,
): Promise<WorkloadCronSnapshot> {
  const ownerPrincipalRef = 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const ownershipRef = 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const action = {
    actorPrincipalRef: ownerPrincipalRef,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    correlationRef: 'oauth-cleanup-test:account',
    idempotencyRef: 'oauth-cleanup-test:account',
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'OAuth cleanup workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      displayName: 'System operations',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: ownerPrincipalRef,
      creationIdempotencyRef: action.idempotencyRef,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: action,
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      ownerPrincipalRef,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: action,
    })
    await ctx.db.insert('memberships', {
      membershipRef: 'mem_cccccccccccccccccccccccccccccccc',
      accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
      memberPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: action,
    })
  })
  return await backend.query(internal.workloadCron.admit, {
    name: 'cleanup expired agent access oauth grants',
  })
}
