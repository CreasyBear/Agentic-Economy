/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'


import { createSourceWriteAdmission, sourceWriteBodyDigest } from '../src/modules/security/source-write-admission'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const externalRunsApi = api.externalRuns

const SOURCE_WRITE_SECRET = 'external-run-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/external-run',
  bodyDigest: sourceWriteBodyDigest(undefined),
}
const adminIdentity = {
  subject: 'external-run-admin',
  tokenIdentifier: 'clerk|external-run-admin',
  issuer: 'https://clerk.example.test',
}

function sourceWrite(operationKey: string) {
  return createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: SOURCE_REQUEST,
    scope: 'admin_operator',
    operationKey,
    correlationId: operationKey,
    nonce: operationKey,
  })
}

async function seedAdmin(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('adminMemberships', {
      clerkUserId: adminIdentity.subject,
      tokenIdentifier: adminIdentity.tokenIdentifier,
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'test',
      grantedAt: 1,
      evidenceRef: 'test:evidence',
    })
  })
}

function manifestArgs(
  operationKey: string,
  providerRefs = ['provider:a', 'provider:b', 'provider:c'],
  independentProviderRefs = ['operator:a', 'operator:b', 'operator:c'],
) {
  return {
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
    sourceWrite: sourceWrite(operationKey),
  }
}

afterEach(() => {
  delete process.env.AE_SOURCE_WRITE_SECRET
})

describe('external run Convex seam', () => {
  it('refuses unauthenticated or incomplete manifest admission', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    const anonymous = await backend.mutation(externalRunsApi.createManifest, manifestArgs('run:anonymous'))
    expect(anonymous).toMatchObject({ kind: 'refused' })

    await seedAdmin(backend)
    const invalid = await backend.withIdentity(adminIdentity).mutation(externalRunsApi.createManifest, manifestArgs('run:invalid', ['provider:a', 'provider:b']))
    expect(invalid).toMatchObject({ kind: 'refused', reason: 'manifest_invalid' })
  })

  it('freezes a manifest and refuses every changed update', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    const created = await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:create'))
    expect(created).toMatchObject({ kind: 'accepted', state: 'frozen' })
    const changed = await admin.mutation(externalRunsApi.updateManifest, manifestArgs('run:update', ['provider:a', 'provider:b', 'provider:c', 'provider:d']))
    expect(changed).toMatchObject({ kind: 'refused', reason: 'manifest_frozen' })
    const read = await backend.query(externalRunsApi.inspectManifest, { runId: 'run:convex:bas' })
    expect(read).toMatchObject({ kind: 'accepted', state: 'frozen' })
  })

  it('replays an identical admitted start after a retry', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:start:retry:create'))
    const candidate = {
      startRef: 'start:retry',
      startedAt: Date.UTC(2026, 7, 1),
      basOutcome: 'current' as const,
      attribution: { channel: 'referral' },
      consentAccepted: true,
      providerRef: 'provider:a',
      independentProviderRef: 'operator:a',
    }
    const first = await admin.mutation(externalRunsApi.admitStart, {
      runId: 'run:convex:bas',
      candidate,
      operationKey: 'run:start:retry:first',
      correlationId: 'run:start:retry:first',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:start:retry:first'),
    })
    const replayed = await admin.mutation(externalRunsApi.admitStart, {
      runId: 'run:convex:bas',
      candidate,
      operationKey: 'run:start:retry:replayed',
      correlationId: 'run:start:retry:replayed',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:start:retry:replayed'),
    })
    expect(first).toMatchObject({ kind: 'accepted' })
    expect(replayed).toMatchObject({ kind: 'replayed' })
    if (first.kind !== 'accepted' || replayed.kind !== 'replayed') throw new Error('start retry was not accepted/replayed')
    expect(replayed.startDigest).toBe(first.startDigest)
  })

  it('refuses a changed manifest when finalization is replayed', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:final:conflict:create'))

    const changed = await admin.mutation(externalRunsApi.finalizeRun, manifestArgs('run:final:conflict:changed', [
      'provider:a',
      'provider:b',
      'provider:d',
    ]))
    expect(changed).toMatchObject({ kind: 'refused', reason: 'manifest_conflict' })

    const finalized = await admin.mutation(externalRunsApi.finalizeRun, manifestArgs('run:final:conflict:accepted'))
    expect(finalized).toMatchObject({ kind: 'accepted', decision: 'FAIL/KILL' })
  })

  it('refuses mismatched provider evidence before append', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:evidence:mismatch:create'))
    const start = await admin.mutation(externalRunsApi.admitStart, {
      runId: 'run:convex:bas',
      candidate: {
        startRef: 'start:evidence:mismatch',
        startedAt: Date.UTC(2026, 7, 1),
        basOutcome: 'current',
        attribution: { channel: 'referral' },
        consentAccepted: true,
        providerRef: 'provider:a',
        independentProviderRef: 'operator:a',
      },
      operationKey: 'run:evidence:mismatch:start',
      correlationId: 'run:evidence:mismatch:start',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:evidence:mismatch:start'),
    })
    expect(start).toMatchObject({ kind: 'accepted' })
    const evidence = await admin.mutation(externalRunsApi.recordEvidence, {
      runId: 'run:convex:bas',
      evidence: {
        evidenceRef: 'evidence:mismatch',
        startRef: 'start:evidence:mismatch',
        evidenceClass: 'provider',
        providerRef: 'provider:b',
        signal: 'provider_backed_completion',
        value: true,
        observedAt: Date.UTC(2026, 7, 1),
      },
      operationKey: 'run:evidence:mismatch:record',
      correlationId: 'run:evidence:mismatch:record',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:evidence:mismatch:record'),
    })
    expect(evidence).toMatchObject({ kind: 'refused', reason: 'provider_evidence_mismatch' })
    const report = await backend.query(externalRunsApi.readReport, { runId: 'run:convex:bas' })
    expect(report).toMatchObject({ kind: 'accepted' })
  })


  it('reports the frozen denominator when recruitment has only one admitted start', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:report:create'))
    const start = await backend.mutation(externalRunsApi.admitStart, {
      runId: 'run:convex:bas',
      candidate: {
        startRef: 'start:one',
        startedAt: Date.UTC(2026, 7, 1),
        basOutcome: 'current',
        attribution: { channel: 'referral' },
        consentAccepted: true,
        providerRef: 'provider:a',
        independentProviderRef: 'operator:a',
      },
      operationKey: 'run:start:one',
      correlationId: 'run:start:one',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:start:one'),
    })
    expect(start).toMatchObject({ kind: 'accepted' })
    const report = await backend.query(externalRunsApi.readReport, { runId: 'run:convex:bas' })
    expect(report).toMatchObject({ kind: 'accepted', decision: 'FAIL/KILL' })
    if (report.kind !== 'accepted') throw new Error('report unavailable')
    const parsed = JSON.parse(report.reportJson) as { reconciliation: { denominator: number; recordedStarts: number; missingStarts: number } }
    expect(parsed.reconciliation).toEqual({ expectedCohort: 12, recordedStarts: 1, missingStarts: 11, excessStarts: 0, denominator: 12, totalsReconcile: false })
  })

  it('persists one final gate decision and blocks post-finalization evidence', async () => {
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const backend = convexTest(schema, modules)
    await seedAdmin(backend)
    const admin = backend.withIdentity(adminIdentity)
    const created = await admin.mutation(externalRunsApi.createManifest, manifestArgs('run:final:create'))
    expect(created).toMatchObject({ kind: 'accepted' })

    const finalized = await admin.mutation(externalRunsApi.finalizeRun, manifestArgs('run:final:decision'))
    expect(finalized).toMatchObject({ kind: 'accepted', decision: 'FAIL/KILL' })

    const replayed = await admin.mutation(externalRunsApi.finalizeRun, manifestArgs('run:final:replay'))
    expect(replayed).toMatchObject({ kind: 'replayed', decision: 'FAIL/KILL' })

    const start = await backend.mutation(externalRunsApi.admitStart, {
      runId: 'run:convex:bas',
      candidate: {
        startRef: 'start:after-final',
        startedAt: Date.UTC(2026, 7, 1),
        basOutcome: 'current',
        attribution: { channel: 'referral' },
        consentAccepted: true,
        providerRef: 'provider:a',
        independentProviderRef: 'operator:a',
      },
      operationKey: 'run:start:after-final',
      correlationId: 'run:start:after-final',
      reasonCode: 't53-test',
      evidenceRefs: ['test:evidence'],
      sourceWrite: sourceWrite('run:start:after-final'),
    })
    expect(start).toMatchObject({ kind: 'refused', reason: 'run_finalized' })

    const report = await backend.query(externalRunsApi.readReport, { runId: 'run:convex:bas' })
    expect(report).toMatchObject({ kind: 'accepted', decision: 'FAIL/KILL', finalDecision: 'FAIL/KILL' })
  })
})
