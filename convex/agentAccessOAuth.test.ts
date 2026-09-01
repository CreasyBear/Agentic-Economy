/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
} from '../src/modules/security/source-write-admission'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { api, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
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
  revision: 1,
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

const reservationRef = (grantRef: string, revision = 1) =>
  `oauth:grant:${grantRef}:reserve:${revision}`

const proofEvidence = (
  reverificationId: string,
  firstFactorAgeMinutes = 0,
  secondFactorAgeMinutes = 0,
) => ({ reverificationId, firstFactorAgeMinutes, secondFactorAgeMinutes })

const reservationCommand = (input: Readonly<{
  grantRef: string
  reverificationId?: string
  firstFactorAgeMinutes?: number
  secondFactorAgeMinutes?: number
  expectedTargetRevision?: number
}>) => {
  const operationKey = reservationRef(input.grantRef)
  return {
    grantRef: input.grantRef,
    expectedGrantRevision: 1,
    expectedTargetRevision: input.expectedTargetRevision ?? 1,
    authorityMode: 'inspect_only' as const,
    connectionTarget: { kind: 'new_agent' as const },
    ...(input.reverificationId === undefined ? {} : {
      proof: proofEvidence(
        input.reverificationId,
        input.firstFactorAgeMinutes,
        input.secondFactorAgeMinutes,
      ),
    }),
    operationKey,
    correlationId: operationKey,
  }
}

const replacementReservationCommand = (input: Readonly<{
  grantRef: string
  principalRef: string
  targetRevision: number
  reverificationId: string
}>) => {
  const operationKey = reservationRef(input.grantRef)
  return {
    grantRef: input.grantRef,
    expectedGrantRevision: 1,
    expectedTargetRevision: input.targetRevision,
    authorityMode: 'inspect_only' as const,
    connectionTarget: {
      kind: 'replace_credential' as const,
      principalRef: input.principalRef,
    },
    proof: proofEvidence(input.reverificationId),
    operationKey,
    correlationId: operationKey,
  }
}

type ConsentMaterialPatch = Partial<Pick<Doc<'agentAccessOAuthGrants'>,
  'clientId' | 'flow' | 'displayName' | 'requestedAccess'>>
type ReplacementTargetFixture = Awaited<ReturnType<typeof insertReplacementTarget>>

const consentMaterialMutations: ReadonlyArray<Readonly<{
  name: string
  id: string
  patch: (row: Doc<'agentAccessOAuthGrants'>) => ConsentMaterialPatch
}>> = [
  { name: 'client ID', id: 'client-id', patch: (row) => ({ clientId: `${row.clientId}-changed` }) },
  {
    name: 'OAuth flow', id: 'flow',
    patch: (row) => ({ flow: row.flow === 'device_code' ? 'authorization_code' : 'device_code' }),
  },
  { name: 'stored display name', id: 'display-name', patch: (row) => ({ displayName: `${row.displayName} changed` }) },
  {
    name: 'environment', id: 'environment',
    patch: (row) => ({ requestedAccess: { ...row.requestedAccess, environment: 'sandbox' } }),
  },
  {
    name: 'per-invocation spend cap', id: 'per-invocation-spend',
    patch: (row) => ({ requestedAccess: {
      ...row.requestedAccess,
      maximumSpendPerInvocation: { currency: 'USD', units: '101', exponent: 2 },
    } }),
  },
  {
    name: 'daily spend cap', id: 'daily-spend',
    patch: (row) => ({ requestedAccess: {
      ...row.requestedAccess,
      maximumDailySpend: { currency: 'USD', units: '501', exponent: 2 },
    } }),
  },
  {
    name: 'monthly spend cap', id: 'monthly-spend',
    patch: (row) => ({ requestedAccess: {
      ...row.requestedAccess,
      maximumMonthlySpend: { currency: 'USD', units: '5001', exponent: 2 },
    } }),
  },
  {
    name: 'concurrency limit', id: 'concurrency',
    patch: (row) => ({ requestedAccess: { ...row.requestedAccess, maximumConcurrentInvocations: 3 } }),
  },
  {
    name: 'per-minute rate', id: 'per-minute',
    patch: (row) => ({ requestedAccess: { ...row.requestedAccess, maximumCallsPerMinute: 11 } }),
  },
  {
    name: 'per-hour rate', id: 'per-hour',
    patch: (row) => ({ requestedAccess: { ...row.requestedAccess, maximumCallsPerHour: 101 } }),
  },
  {
    name: 'credential expiry', id: 'expires',
    patch: (row) => ({ requestedAccess: { ...row.requestedAccess, expiresInSeconds: 86_401 } }),
  },
]

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

  it.each([0, 2, 1.5])('rejects initial revision %s without creating a grant', async (revision) => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const command = {
      grant: { ...grant, revision },
      operationKey: `oauth:test:invalid-initial-revision:${revision}`,
      correlationId: `oauth:test:invalid-initial-revision:${revision}`,
    }

    await expect(backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...command,
      ...(await sourceArgs(command)),
    })).rejects.toThrow('agent_access_oauth_invalid_initial_revision')
    await expect(backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect()))
      .resolves.toEqual([])
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

    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      grantRef: grant.grantRef,
      expectedStatus: 'pending',
      expectedRevision: 1,
      patch: { revision: 99 },
      operationKey: 'oauth:test:cas-caller-revision',
      correlationId: 'oauth:test:cas-caller-revision',
    } as never)).rejects.toThrow(/Unexpected field `revision`/u)

    for (const expectedRevision of [0, -1, 1.5]) {
      const invalidRevisionUpdate = {
        grantRef: grant.grantRef,
        expectedStatus: 'pending' as const,
        expectedRevision,
        patch: { status: 'approved' as const },
        operationKey: `oauth:test:cas-invalid-revision:${expectedRevision}`,
        correlationId: `oauth:test:cas-invalid-revision:${expectedRevision}`,
      }
      await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
        ...invalidRevisionUpdate,
        ...(await sourceArgs(invalidRevisionUpdate)),
      })).rejects.toThrow('agent_access_oauth_invalid_expected_revision')
    }
    await expect(backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect()))
      .resolves.toEqual([expect.objectContaining({ status: 'pending', revision: 1 })])

    const bypassReservation = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      expectedRevision: 1,
      patch: { status: 'issuing' as const, issuanceKey: 'forbidden-bypass', issuanceStartedAt: 2_000 },
      operationKey: 'oauth:test:reservation-bypass',
      correlationId: 'oauth:test:reservation-bypass',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...bypassReservation,
      ...(await sourceArgs(bypassReservation)),
    })).rejects.toThrow('agent_access_oauth_consequence_reservation_required')
    await expect(backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect()))
      .resolves.toEqual([expect.objectContaining({ status: 'pending', revision: 1 })])

    const firstUpdate = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      expectedRevision: 1,
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
      revision: 2,
      ownerId: 'owner:convex',
      approvedAt: 2_000,
    })

    const staleUpdate = {
      ...firstUpdate,
      expectedStatus: 'approved' as const,
      patch: { status: 'denied' as const, denialReason: 'access_denied' as const },
      operationKey: 'oauth:test:cas-stale',
      correlationId: 'oauth:test:cas-stale',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...staleUpdate,
      ...(await sourceArgs(staleUpdate)),
    })).resolves.toBeNull()
    const rows = await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'approved', revision: 2 })
    expect(rows[0]?.denialReason).toBeUndefined()
  })

  it('updates device poll scheduling without changing the authority revision', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const insertCommand = {
      grant,
      operationKey: 'oauth:test:poll-schedule-insert',
      correlationId: 'oauth:test:poll-schedule-insert',
    }
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })
    const schedule = {
      grantRef: grant.grantRef,
      expectedStatus: 'pending' as const,
      expectedRevision: 1,
      patch: { nextPollAt: 6_000 },
      operationKey: 'oauth:test:poll-schedule-update',
      correlationId: 'oauth:test:poll-schedule-update',
    }

    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...schedule,
      ...(await sourceArgs(schedule)),
    })).resolves.toMatchObject({ status: 'pending', revision: 1, nextPollAt: 6_000 })
  })

  it('reacquires an issuing lease only when its persisted start time still matches', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const issuingGrant = {
      ...grant,
      grantRef: 'device:convex-lease-cas',
      status: 'issuing' as const,
      issuanceKey: 'oauth-convex-lease-cas',
      issuanceStartedAt: 2_000,
      connectionTarget: { kind: 'new_agent' as const, displayName: 'Lease recovery agent' },
    }
    const insertCommand = {
      grant: issuingGrant,
      operationKey: 'oauth:test:lease-cas-insert',
      correlationId: 'oauth:test:lease-cas-insert',
    }
    await backend.mutation(api.agentAccessOAuth.insertGrant, {
      ...insertCommand,
      ...(await sourceArgs(insertCommand)),
    })

    const reacquire = {
      grantRef: issuingGrant.grantRef,
      expectedStatus: 'issuing' as const,
      expectedRevision: 1,
      expectedIssuanceStartedAt: 2_000,
      patch: { status: 'issuing' as const, issuanceStartedAt: 3_000 },
      operationKey: 'oauth:test:lease-cas-reacquire',
      correlationId: 'oauth:test:lease-cas-reacquire',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...reacquire,
      ...(await sourceArgs(reacquire)),
    })).resolves.toMatchObject({ status: 'issuing', issuanceStartedAt: 3_000, revision: 2 })

    const stale = {
      ...reacquire,
      expectedIssuanceStartedAt: 3_000,
      patch: { status: 'issuing' as const, issuanceStartedAt: 4_000 },
      operationKey: 'oauth:test:lease-cas-stale',
      correlationId: 'oauth:test:lease-cas-stale',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...stale,
      ...(await sourceArgs(stale)),
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

describe('Agent Access consequence proof reservation', () => {
  it('rejects missing or invalid source-write admission before proof, audit, reservation, or rate state', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'source-admission')
    const missingGrant = await insertReservableGrant(backend, 'device:reserve-source-missing')
    const missing = reservationCommand({
      grantRef: missingGrant.grantRef,
      reverificationId: 'rev_source_missing',
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, missing))
      .rejects.toThrow('agent_access_oauth_source_write_rejected:missing_source_write_admission')

    const invalidGrant = await insertReservableGrant(backend, 'device:reserve-source-invalid')
    const invalid = reservationCommand({
      grantRef: invalidGrant.grantRef,
      reverificationId: 'rev_source_invalid',
    })
    const invalidSource = await sourceArgs(invalid, 'nonce:reserve:source-invalid')
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...invalid,
      ...invalidSource,
      sourceWrite: { ...invalidSource.sourceWrite, signature: 'invalid-source-write-signature' },
    })).rejects.toThrow('agent_access_oauth_source_write_rejected')

    let facts = await reservationFacts(backend)
    expect(facts.proofs).toEqual([])
    expect(facts.audits).toEqual([])
    expect(facts.grants.every((row) => row.status === 'pending'
      && row.revision === 1
      && row.consequenceReservation === undefined)).toBe(true)

    for (let index = 0; index < 5; index += 1) {
      const rateGrant = await insertReservableGrant(backend, `device:reserve-source-rate-${index}`)
      const command = reservationCommand({
        grantRef: rateGrant.grantRef,
        reverificationId: `rev_source_rate_${index}`,
      })
      await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
        ...command,
        ...(await sourceArgs(command, `nonce:reserve:source-rate:${index}`)),
      })).resolves.toMatchObject({ kind: 'reserved' })
    }
    facts = await reservationFacts(backend)
    expect(facts.proofs).toHaveLength(5)
    expect(facts.audits).toHaveLength(5)
  })

  it('leaves no proof, audit, or reservation without authentication, proof, or a current target', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'failure')
    const unauthenticatedGrant = await insertReservableGrant(backend, 'device:reserve-no-auth')
    const unauthenticated = reservationCommand({
      grantRef: unauthenticatedGrant.grantRef,
      reverificationId: 'rev_no_auth',
    })
    await expect(backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...unauthenticated,
      ...(await sourceArgs(unauthenticated, 'nonce:reserve:no-auth')),
    })).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

    const noProofGrant = await insertReservableGrant(backend, 'device:reserve-no-proof')
    const noProof = reservationCommand({ grantRef: noProofGrant.grantRef })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...noProof,
      ...(await sourceArgs(noProof, 'nonce:reserve:no-proof')),
    })).resolves.toEqual({ kind: 'refused', code: 'reauthentication_required' })

    const staleTargetGrant = await insertReservableGrant(backend, 'device:reserve-stale-target')
    const staleTarget = reservationCommand({
      grantRef: staleTargetGrant.grantRef,
      reverificationId: 'rev_stale_target',
      expectedTargetRevision: 2,
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...staleTarget,
      ...(await sourceArgs(staleTarget, 'nonce:reserve:stale-target')),
    })).resolves.toEqual({ kind: 'conflict', code: 'stale_target' })

    const facts = await reservationFacts(backend)
    expect(facts.proofs).toEqual([])
    expect(facts.audits).toEqual([])
    expect(facts.grants).toHaveLength(3)
    expect(facts.grants.every((row) => row.status === 'pending'
      && row.revision === 1
      && row.consequenceReservation === undefined)).toBe(true)
  })

  it('reserves one exact command, truthfully records factor evidence, and safely replays', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'exact')
    const oauthGrant = await insertReservableGrant(backend, 'device:reserve-exact')
    const pollSchedule = {
      grantRef: oauthGrant.grantRef,
      expectedStatus: 'pending' as const,
      expectedRevision: 1,
      patch: { nextPollAt: 6_000 },
      operationKey: 'oauth:test:reserve-exact:poll',
      correlationId: 'oauth:test:reserve-exact:poll',
    }
    await expect(backend.mutation(api.agentAccessOAuth.updateGrant, {
      ...pollSchedule,
      ...(await sourceArgs(pollSchedule, 'nonce:reserve:exact:poll')),
    })).resolves.toMatchObject({ status: 'pending', revision: 1, nextPollAt: 6_000 })
    const command = reservationCommand({
      grantRef: oauthGrant.grantRef,
      reverificationId: 'rev_exact',
      firstFactorAgeMinutes: 30,
      secondFactorAgeMinutes: 0,
    })
    const first = await owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...command,
      ...(await sourceArgs(command, 'nonce:reserve:exact:first')),
    })
    expect(first).toMatchObject({ kind: 'reserved', grantRef: oauthGrant.grantRef, grantRevision: 2 })

    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...command,
      ...(await sourceArgs(command, 'nonce:reserve:exact:replay')),
    })).resolves.toEqual({ ...first, kind: 'replayed' })

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('agentAccessOAuthGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', oauthGrant.grantRef))
        .unique()
      if (row === null) throw new Error('grant_missing')
      await ctx.db.patch(row._id, { displayName: 'Changed stored command' })
    })
    const changed = reservationCommand({
      grantRef: oauthGrant.grantRef,
      reverificationId: 'rev_exact',
      firstFactorAgeMinutes: 30,
      secondFactorAgeMinutes: 0,
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...changed,
      ...(await sourceArgs(changed, 'nonce:reserve:exact:changed')),
    })).resolves.toEqual({ kind: 'refused', code: 'command_changed' })

    const facts = await reservationFacts(backend)
    expect(facts.proofs).toHaveLength(1)
    expect(facts.proofs[0]).toMatchObject({
      reverificationId: 'rev_exact',
      factorEvidence: { firstFactorAgeMinutes: 30, secondFactorAgeMinutes: 0 },
    })
    expect(facts.proofs[0]?.verifiedAt).toBeGreaterThan(Date.now() - 5_000)
    expect(facts.audits).toHaveLength(1)
    expect(facts.grants[0]).toMatchObject({
      status: 'issuing',
      revision: 2,
      consequenceReservation: {
        action: 'agent_access.create',
        reverificationId: 'rev_exact',
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
      },
    })
  })

  it.each(consentMaterialMutations)(
    'binds stored $name into the exact consequence digest',
    async ({ id, patch }) => {
      process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
      const backend = convexTest(schema, modules)
      registerRateLimiter(backend)
      const owner = await materializeReservationOwner(backend, `material-${id}`)
      const oauthGrant = await insertReservableGrant(backend, `device:reserve-material-${id}`)
      const command = reservationCommand({
        grantRef: oauthGrant.grantRef,
        reverificationId: `rev_material_${id}`,
      })
      const first = await owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
        ...command,
        ...(await sourceArgs(command, `nonce:reserve:material:${id}:first`)),
      })
      expect(first).toMatchObject({ kind: 'reserved' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('agentAccessOAuthGrants')
          .withIndex('by_grantRef', (query) => query.eq('grantRef', oauthGrant.grantRef))
          .unique()
        if (row === null) throw new Error('material test grant missing')
        await ctx.db.patch(row._id, patch(row))
      })
      await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
        ...command,
        ...(await sourceArgs(command, `nonce:reserve:material:${id}:changed`)),
      })).resolves.toEqual({ kind: 'refused', code: 'command_changed' })
    },
  )

  it('uses first-factor age only as a truthful fallback and rejects stale fallback proof', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'fallback')
    const fallbackGrant = await insertReservableGrant(backend, 'device:reserve-fallback')
    const fallback = reservationCommand({
      grantRef: fallbackGrant.grantRef,
      reverificationId: 'rev_fallback',
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...fallback,
      ...(await sourceArgs(fallback, 'nonce:reserve:fallback')),
    })).resolves.toMatchObject({ kind: 'reserved' })

    const staleGrant = await insertReservableGrant(backend, 'device:reserve-stale-proof')
    const stale = reservationCommand({
      grantRef: staleGrant.grantRef,
      reverificationId: 'rev_stale',
      firstFactorAgeMinutes: 10,
      secondFactorAgeMinutes: -1,
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...stale,
      ...(await sourceArgs(stale, 'nonce:reserve:stale-proof')),
    })).resolves.toEqual({ kind: 'refused', code: 'proof_stale' })

    const facts = await reservationFacts(backend)
    expect(facts.proofs).toHaveLength(1)
    expect(facts.proofs[0]?.factorEvidence).toEqual({
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    })
    expect(facts.audits[0]?.redactedPayloadJson).not.toMatch(/mfa/u)
    expect(facts.grants.find((row) => row.grantRef === staleGrant.grantRef))
      .toMatchObject({ status: 'pending', revision: 1 })
  })

  it('refuses cross-Account proof reuse and rate limits before proof or reservation writes', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const firstOwner = await materializeReservationOwner(backend, 'account-one')
    const firstGrant = await insertReservableGrant(backend, 'device:reserve-account-one')
    const first = reservationCommand({ grantRef: firstGrant.grantRef, reverificationId: 'rev_cross_account' })
    await expect(firstOwner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...first,
      ...(await sourceArgs(first, 'nonce:reserve:account-one')),
    })).resolves.toMatchObject({ kind: 'reserved' })

    const secondOwner = await materializeReservationOwner(backend, 'account-two')
    const secondGrant = await insertReservableGrant(backend, 'device:reserve-account-two')
    const crossAccount = reservationCommand({ grantRef: secondGrant.grantRef, reverificationId: 'rev_cross_account' })
    await expect(secondOwner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...crossAccount,
      ...(await sourceArgs(crossAccount, 'nonce:reserve:account-two')),
    })).resolves.toEqual({ kind: 'refused', code: 'proof_replayed' })

    for (let index = 0; index < 5; index += 1) {
      const rateGrant = await insertReservableGrant(backend, `device:reserve-rate-${index}`)
      const rateCommand = reservationCommand({
        grantRef: rateGrant.grantRef,
        reverificationId: `rev_rate_${index}`,
      })
      const result = await secondOwner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
        ...rateCommand,
        ...(await sourceArgs(rateCommand, `nonce:reserve:rate:${index}`)),
      })
      if (index < 5) expect(result.kind).toBe('reserved')
    }
    const beforeLimit = await reservationFacts(backend)
    const limitedGrant = await insertReservableGrant(backend, 'device:reserve-rate-limited')
    const limited = reservationCommand({ grantRef: limitedGrant.grantRef, reverificationId: 'rev_rate_limited' })
    await expect(secondOwner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...limited,
      ...(await sourceArgs(limited, 'nonce:reserve:rate:limited')),
    })).resolves.toMatchObject({ kind: 'rate_limited' })

    const facts = await reservationFacts(backend)
    expect(facts.audits).toHaveLength(beforeLimit.audits.length)
    expect(facts.proofs.some((row) => row.reverificationId === 'rev_cross_account'
      && row.activeAccountRef === secondOwner.accountRef)).toBe(false)
    expect(facts.proofs.some((row) => row.reverificationId === 'rev_rate_limited')).toBe(false)
    expect(facts.grants.find((row) => row.grantRef === limitedGrant.grantRef))
      .toMatchObject({ status: 'pending', revision: 1 })
  })

  it('binds replacement to the current Agent revision and active Account membership', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'replacement')
    const target = await insertReplacementTarget(backend, owner.accountRef, 'replacement', 3)
    const oauthGrant = await insertReservableGrant(backend, 'device:reserve-replacement')
    const command = replacementReservationCommand({
      grantRef: oauthGrant.grantRef,
      principalRef: target.principalRef,
      targetRevision: target.revision,
      reverificationId: 'rev_replacement',
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...command,
      ...(await sourceArgs(command, 'nonce:reserve:replacement')),
    })).resolves.toMatchObject({ kind: 'reserved' })
    const reserved = (await reservationFacts(backend)).grants
      .find((row) => row.grantRef === oauthGrant.grantRef)
    expect(reserved).toMatchObject({
      status: 'issuing',
      connectionTarget: { kind: 'replace_credential', principalRef: target.principalRef },
      consequenceReservation: {
        action: 'agent_access.replace_credential',
        targetRevision: 3,
        predecessor: target.predecessor,
      },
    })

    const staleGrant = await insertReservableGrant(backend, 'device:reserve-replacement-stale')
    const stale = replacementReservationCommand({
      grantRef: staleGrant.grantRef,
      principalRef: target.principalRef,
      targetRevision: 2,
      reverificationId: 'rev_replacement_stale',
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...stale,
      ...(await sourceArgs(stale, 'nonce:reserve:replacement-stale')),
    })).resolves.toEqual({ kind: 'conflict', code: 'stale_target' })
    expect((await reservationFacts(backend)).proofs
      .some((row) => row.reverificationId === 'rev_replacement_stale')).toBe(false)
  })

  it.each([
    {
      name: 'binding revision',
      drift: async (backend: TestConvex<typeof schema>, target: ReplacementTargetFixture) => {
        await backend.run(async (ctx) => {
          const row = await ctx.db.query('externalIdentityBindings')
            .withIndex('by_bindingRef', (query) => query.eq('bindingRef', target.predecessor.bindingRef))
            .unique()
          if (row === null) throw new Error('replacement binding missing')
          await ctx.db.patch(row._id, { revision: row.revision + 1 })
        })
      },
    },
    {
      name: 'credential revision',
      drift: async (backend: TestConvex<typeof schema>, target: ReplacementTargetFixture) => {
        await backend.run(async (ctx) => {
          const row = await ctx.db.query('credentials')
            .withIndex('by_credentialRef', (query) => query.eq('credentialRef', target.predecessor.credentialRef))
            .unique()
          if (row === null) throw new Error('replacement credential missing')
          await ctx.db.patch(row._id, { revision: row.revision + 1 })
        })
      },
    },
    {
      name: 'credential generation',
      drift: async (backend: TestConvex<typeof schema>, target: ReplacementTargetFixture) => {
        await backend.run(async (ctx) => {
          const binding = await ctx.db.query('externalIdentityBindings')
            .withIndex('by_bindingRef', (query) => query.eq('bindingRef', target.predecessor.bindingRef))
            .unique()
          const credential = await ctx.db.query('credentials')
            .withIndex('by_credentialRef', (query) => query.eq('credentialRef', target.predecessor.credentialRef))
            .unique()
          if (binding === null || credential === null) throw new Error('replacement generation rows missing')
          await ctx.db.patch(binding._id, { credentialGeneration: binding.credentialGeneration + 1 })
          await ctx.db.patch(credential._id, { generation: credential.generation + 1 })
        })
      },
    },
    {
      name: 'grant generation',
      drift: async (backend: TestConvex<typeof schema>, target: ReplacementTargetFixture) => {
        await backend.run(async (ctx) => {
          const principal = await ctx.db.query('agentAccessPrincipals')
            .withIndex('by_principalId', (query) => query.eq('principalId', target.principalRef))
            .unique()
          const grant = await ctx.db.query('agentAccessGrants')
            .withIndex('by_grantRef', (query) => query.eq('grantRef', target.predecessor.grantRef))
            .unique()
          if (principal === null || grant === null) throw new Error('replacement grant generation rows missing')
          await ctx.db.patch(principal._id, { grantGeneration: principal.grantGeneration + 1 })
          await ctx.db.patch(grant._id, { generation: grant.generation + 1 })
        })
      },
    },
    {
      name: 'grant policy digest',
      drift: async (backend: TestConvex<typeof schema>, target: ReplacementTargetFixture) => {
        await backend.run(async (ctx) => {
          const principal = await ctx.db.query('agentAccessPrincipals')
            .withIndex('by_principalId', (query) => query.eq('principalId', target.principalRef))
            .unique()
          const grant = await ctx.db.query('agentAccessGrants')
            .withIndex('by_grantRef', (query) => query.eq('grantRef', target.predecessor.grantRef))
            .unique()
          if (principal === null || grant === null) throw new Error('replacement grant policy rows missing')
          const policyDigest = `${grant.policyDigest}:changed`
          await ctx.db.patch(principal._id, { policyDigest })
          await ctx.db.patch(grant._id, { policyDigest })
        })
      },
    },
  ])('refuses same-proof replay after $name drift', async ({ name, drift }) => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, `replacement-drift-${name}`)
    const target = await insertReplacementTarget(backend, owner.accountRef, `drift-${name}`, 3)
    const oauthGrant = await insertReservableGrant(backend, `device:reserve-replacement-${name.replaceAll(' ', '-')}`)
    const command = replacementReservationCommand({
      grantRef: oauthGrant.grantRef,
      principalRef: target.principalRef,
      targetRevision: target.revision,
      reverificationId: `rev_replacement_${name.replaceAll(' ', '_')}`,
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...command,
      ...(await sourceArgs(command, `nonce:reserve:replacement:${name}:first`)),
    })).resolves.toMatchObject({ kind: 'reserved' })

    await drift(backend, target)
    const replay = await owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, {
      ...command,
      ...(await sourceArgs(command, `nonce:reserve:replacement:${name}:replay`)),
    })
    expect(replay.kind).not.toBe('reserved')
    expect(replay.kind).not.toBe('replayed')
  })

  it('rolls proof, nonce, and reservation writes back when audit persistence fails', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    registerRateLimiter(backend)
    const owner = await materializeReservationOwner(backend, 'rollback')
    const oauthGrant = await insertReservableGrant(backend, 'device:reserve-rollback')
    const command = reservationCommand({
      grantRef: oauthGrant.grantRef,
      reverificationId: 'rev_rollback',
    })
    const proofDigest = canonicalDigest({
      version: 'ae.consequence-proof-evidence:v1',
      reverificationId: 'rev_rollback',
    })
    const eventId = `audit:consequence.proof_consumed:${proofDigest.slice('sha256:'.length)}`
    await backend.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert('auditEvents', {
          eventId,
          eventType: 'consequence.proof_consumed',
          actorKind: 'owner',
          actorRef: owner.principalRef,
          activeAccountRef: owner.accountRef,
          sourceSystem: 'ae_recorded',
          targetType: 'consequence_command',
          targetRef: `${oauthGrant.grantRef}:${index}`,
          beforeState: 'available',
          afterState: 'consumed',
          idempotencyKey: `rollback:${index}`,
          correlationId: `rollback:${index}`,
          evidenceRefs: [],
          redactedPayloadJson: '{}',
          payloadHash: proofDigest,
          createdAt: Date.now(),
        })
      }
    })
    const signed = {
      ...command,
      ...(await sourceArgs(command, 'nonce:reserve:rollback')),
    }
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, signed))
      .rejects.toThrow()
    let facts = await reservationFacts(backend)
    expect(facts.proofs).toEqual([])
    expect(facts.grants[0]).toMatchObject({ status: 'pending', revision: 1 })

    await backend.run(async (ctx) => {
      const conflicts = await ctx.db.query('auditEvents')
        .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
        .collect()
      for (const row of conflicts) await ctx.db.delete(row._id)
    })
    await expect(owner.backend.mutation(api.agentAccessOAuth.reserveAgentAccessConsent, signed))
      .resolves.toMatchObject({ kind: 'reserved' })
    facts = await reservationFacts(backend)
    expect(facts.proofs).toHaveLength(1)
    expect(facts.audits).toHaveLength(1)
    expect(facts.grants[0]).toMatchObject({ status: 'issuing', revision: 2 })
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
          revision: 1,
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
        revision: 1,
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
          revision: 1,
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
          revision: 1,
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
        revision: 1,
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

async function materializeReservationOwner(
  backend: TestConvex<typeof schema>,
  suffix: string,
) {
  const tokenIdentifier = `https://clerk.test|reservation-${suffix}`
  const authenticated = backend.withIdentity({
    subject: `user_reservation_${suffix}`,
    issuer: 'https://clerk.test',
    tokenIdentifier,
    name: `Reservation ${suffix}`,
  })
  await expect(authenticated.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}))
    .resolves.toBe(true)
  const authority = await backend.run(async (ctx) => {
    const binding = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user').eq('providerIdentifier', tokenIdentifier))
      .unique()
    if (binding === null) throw new Error('reservation owner binding missing')
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('ownerPrincipalRef', binding.principalRef).eq('lifecycle', 'active'))
      .unique()
    if (ownership === null) throw new Error('reservation owner ownership missing')
    return { principalRef: binding.principalRef, accountRef: ownership.accountRef }
  })
  return { backend: authenticated, ...authority }
}

async function insertReservableGrant(
  backend: TestConvex<typeof schema>,
  grantRef: string,
) {
  const now = Date.now()
  const value = {
    ...grant,
    grantRef,
    revision: 1,
    deviceCodeHash: `${grantRef}:device-hash`,
    userCodeHash: `${grantRef}:user-hash`,
    authorizationCodeHash: `${grantRef}:authorization-hash`,
    status: 'pending' as const,
    createdAt: now,
    expiresAt: now + 60 * 60_000,
    nextPollAt: now,
  }
  const command = {
    grant: value,
    operationKey: `oauth:test:insert:${grantRef}`,
    correlationId: `oauth:test:insert:${grantRef}`,
  }
  await backend.mutation(api.agentAccessOAuth.insertGrant, {
    ...command,
    ...(await sourceArgs(command, `nonce:insert:${grantRef}`)),
  })
  return value
}

async function insertReplacementTarget(
  backend: TestConvex<typeof schema>,
  accountRef: string,
  suffixSeed: string,
  revision: number,
) {
  const suffix = canonicalDigest({
    version: 'ae.test.agent-access-replacement-target:v1',
    suffixSeed,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const principalRef = `prn_${suffix}`
  const membershipRef = `mem_${suffix}`
  const credentialId = `key_${suffix}`
  const applicationRef = `application:${suffix}`
  const bindingRef = `binding:${suffix}`
  const credentialRef = `credential:${suffix}:1`
  const grantRef = `grant:${suffix}:1`
  const policyDigest = `sha256:${suffix}${suffix}`
  const environment = 'production' as const
  const generation = 1
  const expiresAt = Date.now() + 86_400_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef,
      kind: 'agent',
      displayName: 'Replacement target',
      lifecycle: 'active',
      revision,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('memberships', {
      membershipRef,
      accountRef,
      memberPrincipalRef: principalRef,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: principalRef,
        activeAccountRef: accountRef,
        correlationRef: `create:${principalRef}`,
        idempotencyRef: `create:${principalRef}`,
      },
    })
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: principalRef,
      ownerId: accountRef,
      credentialId,
      applicationRef,
      environment,
      scopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
      authorityMode: 'inspect_only',
      grantGeneration: generation,
      policyDigest,
      lifecycle: 'active',
      expiresAt,
      recordedAt: 1,
      lastSeenAt: 1,
    })
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: generation,
      bindIdempotencyRef: `bind:${suffix}`,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('credentials', {
      credentialRef,
      bindingRef,
      principalRef,
      type: 'api_key',
      lifecycle: 'active',
      generation,
      issueIdempotencyRef: `issue:${suffix}`,
      revision: 1,
      issuedAt: 1,
      expiresAt,
      updatedAt: 1,
    })
    await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v1',
      grantRef,
      principalId: principalRef,
      ownerId: accountRef,
      applicationRef,
      credentialId,
      environment,
      operationAccess: 'all_admitted',
      authorityMode: 'inspect_only',
      policy: {
        format: 'ae.agent-access-policy:v1',
        operationAccess: 'all_admitted',
        environment,
        budget: {
          budgetPolicyRef: `budget:${suffix}`,
          generation,
          currency: 'USD',
          exponent: 2,
          maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
          maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
          maximumMonthlySpend: { currency: 'USD', units: '5000', exponent: 2 },
          maximumConcurrentInvocations: 2,
        },
        rate: {
          ratePolicyRef: `rate:${suffix}`,
          generation,
          maximumCallsPerMinute: 10,
          maximumCallsPerHour: 100,
        },
      },
      budgetPolicyRef: `budget:${suffix}`,
      ratePolicyRef: `rate:${suffix}`,
      lifecycle: 'active',
      generation,
      policyDigest,
      createdAt: 1,
      updatedAt: 1,
      expiresAt,
    })
  })
  return {
    principalRef,
    revision,
    predecessor: {
      credentialId,
      applicationRef,
      environment,
      grantRef,
      grantGeneration: generation,
      policyDigest,
      bindingRef,
      bindingRevision: 1,
      bindingCredentialGeneration: generation,
      credentialRef,
      credentialRevision: 1,
      credentialGeneration: generation,
    },
  }
}

async function reservationFacts(backend: TestConvex<typeof schema>) {
  return await backend.run(async (ctx) => ({
    proofs: await ctx.db.query('consequenceProofUses').collect(),
    audits: (await ctx.db.query('auditEvents').collect())
      .filter((row) => row.eventType === 'consequence.proof_consumed'),
    grants: await ctx.db.query('agentAccessOAuthGrants').collect(),
  }))
}

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
