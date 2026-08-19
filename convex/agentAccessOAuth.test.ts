/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

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

  it('refuses grant writes against unlisted OAuth tables after source admission', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:insert',
      correlationId: 'oauth:test:insert',
    }
    const insertResult = await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })
    expect(insertResult).toBeNull()
    const readCommand = {
      grantRef: grant.grantRef,
      operationKey: 'oauth:test:read',
      correlationId: 'oauth:test:read',
    }
    await expect(backend.query(api.agentAccessOAuth.getGrantByRef, {
      ...readCommand,
      ...(await sourceArgs(readCommand)),
    })).resolves.toBeNull()
  })
})

describe('Agent Access OAuth grant cleanup', () => {
  it('no-ops cleanup after OAuth grant tables were unlisted', async () => {
    const backend = convexTest(schema, modules)
    const now = 10 * 24 * 60 * 60 * 1_000
    const result = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, { now, batchSize: 10 })
    expect(result).toMatchObject({ deleted: 0, rescheduled: false })
    expect(result.cutoff).toBeLessThan(now)
  })
})
