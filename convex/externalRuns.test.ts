/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'


import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '../src/modules/security/source-write-admission'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const externalRunsApi = api.externalRuns

const SOURCE_WRITE_SECRET = 'external-run-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  initiatorOrigin: 'http://127.0.0.1:3024',
  targetOrigin: 'http://127.0.0.1:3024',
  targetPath: '/api/external-run',
  targetQuery: '',
} as const
const adminIdentity = {
  subject: 'external-run-admin',
  tokenIdentifier: 'clerk|external-run-admin',
  issuer: 'https://clerk.example.test',
}

async function signedExternalRunArgs<T extends { operationKey: string; correlationId: string }>(
  command: T,
  nonce = command.operationKey,
): Promise<T & { sourceWriteRequest: SourceWriteAdmissionRequest; sourceWrite: SourceWriteAdmission }> {
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: {
      ...SOURCE_REQUEST,
      bodyDigest: sourceWriteCommandBodyDigest(command),
    },
    scope: 'admin_operator',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
  })
  return {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  }
}

async function manifestArgs(
  operationKey: string,
  providerRefs = ['provider:a', 'provider:b', 'provider:c'],
  independentProviderRefs = ['operator:a', 'operator:b', 'operator:c'],
) {
  return await signedExternalRunArgs({
    manifest: {
      runId: 'run:convex:bas',
      window: { startsOn: '2026-08-01', endsOn: '2026-08-31' },
      providerRefs,
      independentProviderRefs,
      requiresSettledPayment: false,
    },
    operationKey,
    correlationId: operationKey,
    reasonCode: 't53-test',
    evidenceRefs: ['test:evidence'],
  })
}

afterEach(() => {
  delete process.env.AE_SOURCE_WRITE_SECRET
})

describe('external run Convex seam', () => {
  it('refuses unauthenticated or incomplete manifest admission', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const anonymous = await backend.mutation(externalRunsApi.createManifest, await manifestArgs('run:anonymous'))
    expect(anonymous).toMatchObject({ kind: 'refused' })

    const authenticated = await backend.withIdentity(adminIdentity).mutation(externalRunsApi.createManifest, await manifestArgs('run:invalid', ['provider:a', 'provider:b']))
    expect(authenticated).toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
  })

  it('fails closed for authenticated identities without querying unlisted admin memberships', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const admin = backend.withIdentity(adminIdentity)
    expect(await admin.mutation(externalRunsApi.createManifest, await manifestArgs('run:readback:create'))).toMatchObject({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    expect(await admin.query(externalRunsApi.inspectManifest, { runId: 'run:convex:bas' })).toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    expect(await admin.query(externalRunsApi.readReport, { runId: 'run:convex:bas' })).toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
  })
})
