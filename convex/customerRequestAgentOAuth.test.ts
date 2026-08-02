/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSourceWriteAdmission } from '../src/modules/security/source-write-admission'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const SOURCE_WRITE_SECRET = 'oauth-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'https://ae.example',
  pathname: '/oauth/token',
  bodyDigest: 'none',
} as const

const admission = (operationKey: string, nonce = operationKey) => createSourceWriteAdmission({
  env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
  request: SOURCE_REQUEST,
  scope: 'agent_identity',
  operationKey,
  correlationId: operationKey,
  nonce,
})

const sourceArgs = (operationKey: string, nonce = operationKey) => ({
  operationKey,
  correlationId: operationKey,
  sourceWrite: admission(operationKey, nonce),
})

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

describe('Customer Request OAuth Convex persistence adapter', () => {
  it('rejects direct unauthenticated grant writes and enumerable grant reads without a source envelope', async () => {
    delete process.env.AE_SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(api.customerRequestAgentOAuth.insertGrant, {
      grant,
      operationKey: 'oauth:test:unauthenticated',
      correlationId: 'oauth:test:unauthenticated',
    })).rejects.toThrow('customer_request_agent_oauth_source_write_rejected:missing_source_write_admission')
    await expect(backend.query(api.customerRequestAgentOAuth.getGrantByRef, {
      grantRef: grant.grantRef,
      operationKey: 'oauth:test:unauthenticated-read',
      correlationId: 'oauth:test:unauthenticated-read',
    })).rejects.toThrow('oauth_source_read_rejected')
  })

  it('persists full machine state, enforces CAS, and freezes authority fields after approval', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await backend.mutation(api.customerRequestAgentOAuth.insertGrant, { grant, ...sourceArgs('oauth:test:insert') })
    const stored = await backend.query(api.customerRequestAgentOAuth.getGrantByRef, {
      grantRef: grant.grantRef,
      ...sourceArgs('oauth:test:read'),
    })
    expect(stored).toMatchObject(grant)

    const first = await backend.mutation(api.customerRequestAgentOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'pending',
      patch: { status: 'approved', ownerId: 'owner-convex', keyId: 'key-convex', approvedAt: 1_001 },
      ...sourceArgs('oauth:test:approve'),
    })
    const second = await backend.mutation(api.customerRequestAgentOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'pending',
      patch: { status: 'approved', ownerId: 'owner-race', keyId: 'key-race', approvedAt: 1_002 },
      ...sourceArgs('oauth:test:cas-race'),
    })
    expect(first).toMatchObject({ status: 'approved', ownerId: 'owner-convex' })
    expect(second).toBeNull()

    await expect(backend.mutation(api.customerRequestAgentOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'approved',
      patch: { requestedScopes: ['customer_requests:create', 'customer_requests:full_yolo'] },
      ...sourceArgs('oauth:test:scope-mutation'),
    })).rejects.toThrow('oauth_grant_immutable_after_approval')
  })
})

describe('Customer Request OAuth grant cleanup', () => {
  afterEach(() => vi.useRealTimers())

  it('removes old expired and consumed grants while retaining live grants and clients', async () => {
    const backend = convexTest(schema, modules)
    const now = 10 * 24 * 60 * 60 * 1_000

    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestAgentOAuthGrants', cleanupGrant('grant:expired', 'expired', 1_000))
      await ctx.db.insert('customerRequestAgentOAuthGrants', cleanupGrant('grant:consumed', 'consumed', 2_000))
      await ctx.db.insert('customerRequestAgentOAuthGrants', cleanupGrant('grant:live', 'pending', now))
      await ctx.db.insert('customerRequestAgentOAuthClients', {
        clientId: 'client:retained',
        clientName: 'Retained client',
        redirectUris: [],
        grantTypes: ['authorization_code'],
        tokenEndpointAuthMethod: 'none',
        createdAt: 1_000,
      })
    })

    const result = await backend.mutation(internal.customerRequestAgentOAuth.cleanupExpiredOAuthGrants, { now, batchSize: 10 })

    expect(result.deleted).toBe(2)
    expect(result.rescheduled).toBe(false)
    expect(result.cutoff).toBeLessThan(now)

    const remaining = await backend.run(async (ctx) => ({
      grants: await ctx.db.query('customerRequestAgentOAuthGrants').take(10),
      client: await ctx.db.query('customerRequestAgentOAuthClients')
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
        await ctx.db.insert('customerRequestAgentOAuthGrants', cleanupGrant(`grant:old-${index}`, status, index + 1))
      }
    })

    const first = await backend.mutation(internal.customerRequestAgentOAuth.cleanupExpiredOAuthGrants, { now, batchSize: 2 })

    expect(first).toMatchObject({ deleted: 2, rescheduled: true })
    await backend.finishAllScheduledFunctions(vi.runAllTimers)

    const remaining = await backend.run(async (ctx) => await ctx.db.query('customerRequestAgentOAuthGrants').take(10))
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
