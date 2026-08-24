import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  admitBasStart,
  createExternalRunEvidence,
  createExternalRunManifest,
} from '@/modules/external-run/convex'
import { stableStringify } from '@/modules/common/stable-hash'
import { convexModules as modules, ownerAdmin } from '../helpers/convex-fixtures'

const page = { cursor: null, numItems: 20 }
const manifestInput = {
  runId: 'legacy-run',
  window: { startsOn: '2026-05-01', endsOn: '2026-05-31' },
  providerRefs: ['provider-1', 'provider-2', 'provider-3'],
  independentProviderRefs: ['independent-1', 'independent-2', 'independent-3'],
  requiresSettledPayment: false,
}
const writeContext = {
  operationKey: 'legacy:freeze',
  correlationId: 'legacy-freeze-correlation',
  reasonCode: 'release_a_writer_freeze',
  evidenceRefs: ['release-a:test'],
}

describe('Release A legacy writer freeze', () => {
  it('fails all fifteen writers closed without changing legacy data or scheduling work', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_legacy_freeze')
    const startedAt = Date.UTC(2026, 4, 2)
    const manifest = createExternalRunManifest(manifestInput, 1, 'user_legacy_freeze')
    const admission = admitBasStart(manifest, {
      startRef: 'start-1',
      startedAt,
      basOutcome: 'current',
      attribution: { channel: 'test' },
      consentAccepted: true,
      providerRef: 'provider-1',
      independentProviderRef: 'independent-1',
    }, startedAt)
    if (admission.kind !== 'accepted') throw new Error('legacy_start_fixture_refused')
    const evidence = createExternalRunEvidence({
      evidenceRef: 'evidence-1',
      startRef: admission.start.startRef,
      evidenceClass: 'sandbox',
      signal: 'decision_ready_within_24h',
      value: true,
      observedAt: startedAt,
    })

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId: 'legacy-thread',
        pseudonymousSessionId: 'legacy-session',
        title: 'Legacy thread',
        createdAt: 1,
        updatedAt: 2,
      })
      await ctx.db.insert('answerTurns', {
        turnId: 'legacy-turn',
        threadId: 'legacy-thread',
        seq: 1,
        query: 'Legacy question',
        intent: 'unsupported',
        evidenceJson: '{}',
        snapshotHash: 'snapshot',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 2,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'legacy-reservation',
        sessionId: 'legacy-session',
        requestedThreadScope: 'legacy-thread',
        requestDigest: 'request-digest',
        threadId: 'legacy-thread',
        turnId: 'legacy-turn',
        seq: 1,
        query: 'Legacy question',
        generation: 0,
        state: 'finalized',
        finalStatus: 'complete',
        createdAt: 1,
        updatedAt: 2,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'legacy-tool-call',
        turnId: 'legacy-turn',
        seq: 1,
        toolId: 'registry.operations.search',
        inputJson: '{}',
        resultSummaryJson: '{}',
        resultJson: '{}',
        resultHash: 'result-hash',
        status: 'complete',
        createdAt: 2,
      })
      await ctx.db.insert('answerThreadShares', {
        threadId: 'legacy-thread',
        accessId: 'legacy-access',
        generation: 1,
        verifier: 'legacy-verifier',
        keyId: 'legacy-key',
        status: 'active',
        createdAt: 2,
      })
      await ctx.db.insert('harnessSessions', {
        sessionId: 'legacy-session',
        ownerKey: 'legacy-owner',
        entryCount: 1,
        activeLeafEntryId: 'legacy-entry',
        lastRunId: 'legacy-run',
        status: 'ok',
        createdAt: 1,
        updatedAt: 2,
      })
      await ctx.db.insert('harnessSessionEntries', {
        entryId: 'legacy-entry',
        sessionId: 'legacy-session',
        ownerKey: 'legacy-owner',
        runId: 'legacy-run',
        turnId: 'legacy-turn',
        seq: 1,
        kind: 'session.created',
        status: 'ok',
        idempotencyKey: 'legacy-entry',
        requestHash: 'request-hash',
        createdAt: 1,
        payloadJson: '{}',
        publicSummaryJson: '{}',
        privatePayloadJson: '{}',
        schemaVersion: 1,
      })
      await ctx.db.insert('externalRunManifests', {
        runId: manifest.runId,
        manifestDigest: manifest.digest,
        manifestJson: stableStringify(manifest as never),
        state: 'frozen',
        operationKey: 'legacy:manifest',
        actorRef: manifest.createdBy,
        createdAt: manifest.createdAt,
        frozenAt: manifest.frozenAt,
      })
      await ctx.db.insert('externalRunStarts', {
        runId: manifest.runId,
        startRef: admission.start.startRef,
        startDigest: admission.start.digest,
        startJson: stableStringify(admission.start as never),
        providerRef: admission.start.providerRef,
        independentProviderRef: admission.start.independentProviderRef,
        startedAt: admission.start.startedAt,
        operationKey: 'legacy:start',
        admittedAt: admission.start.admittedAt,
      })
      await ctx.db.insert('externalRunEvidence', {
        runId: manifest.runId,
        startRef: evidence.startRef,
        evidenceRef: evidence.evidenceRef,
        evidenceDigest: evidence.digest,
        evidenceJson: stableStringify(evidence as never),
        evidenceClass: evidence.evidenceClass,
        signal: evidence.signal,
        observedAt: evidence.observedAt,
        operationKey: 'legacy:evidence',
      })
      await ctx.db.insert('externalRunGateDecisions', {
        runId: manifest.runId,
        manifestDigest: manifest.digest,
        reportDigest: 'legacy-report-digest',
        decision: 'FAIL/KILL',
        failedGatesJson: '[]',
        operationKey: 'legacy:finalize',
        actorRef: manifest.createdBy,
        finalizedAt: startedAt,
      })
    })

    const before = await legacySnapshot(backend)
    const answerContext = {
      sessionId: 'legacy-session',
      threadId: 'legacy-thread',
      turnId: 'legacy-turn',
      operationKey: 'legacy:answer',
      correlationId: 'legacy-answer-correlation',
    }
    const calls = [
      () => backend.mutation(api.answerThreads.reserveAnswerTurn, {
        sessionId: answerContext.sessionId,
        requestedThreadScope: answerContext.threadId,
        query: 'Retired question',
        requestDigest: 'retired-request-digest',
        reservationKey: 'retired-reservation',
        title: 'Retired thread',
        operationKey: answerContext.operationKey,
        correlationId: answerContext.correlationId,
      }),
      () => backend.mutation(api.answerThreads.renewAnswerTurnLease, {
        reservationKey: 'legacy-reservation',
        requestDigest: 'request-digest',
        ...answerContext,
        turnSeq: 1,
        generation: 0,
      }),
      () => backend.mutation(api.answerThreads.persistAnswerTurnCheckpoint, {
        reservationKey: 'legacy-reservation',
        requestDigest: 'request-digest',
        ...answerContext,
        turnSeq: 1,
        generation: 0,
        checkpointStep: 1,
        checkpointJson: '{}',
        checkpointDigest: 'checkpoint-digest',
      }),
      () => backend.mutation(api.answerThreads.stopAnswerTurn, answerContext),
      () => backend.mutation(api.answerThreads.issueAnswerThreadShare, {
        threadId: answerContext.threadId,
        pseudonymousSessionId: answerContext.sessionId,
        operationKey: answerContext.operationKey,
        correlationId: answerContext.correlationId,
      }),
      () => backend.mutation(api.answerThreads.revokeAnswerThreadShare, {
        threadId: answerContext.threadId,
        pseudonymousSessionId: answerContext.sessionId,
        operationKey: answerContext.operationKey,
        correlationId: answerContext.correlationId,
      }),
      () => backend.mutation(internal.answerThreads.continueDeleteAnswerThread, {
        threadId: answerContext.threadId,
      }),
      () => backend.mutation(api.answerThreads.deleteAnswerThread, {
        threadId: answerContext.threadId,
        pseudonymousSessionId: answerContext.sessionId,
        operationKey: answerContext.operationKey,
        correlationId: answerContext.correlationId,
      }),
      () => backend.mutation(api.harnessSessions.appendHarnessSessionEntry, {
        ownerKey: 'legacy-owner',
        operationKey: 'legacy:harness',
        correlationId: 'legacy-harness-correlation',
        entryId: 'retired-entry',
        sessionId: 'legacy-session',
        runId: 'legacy-run',
        kind: 'turn.started',
        createdAt: 3,
        payloadJson: '{}',
      }),
      () => backend.mutation(api.harnessSessions.finalizeReservedAnswerTurn, {
        reservationKey: 'legacy-reservation',
        requestDigest: 'request-digest',
        sessionId: 'legacy-session',
        threadId: 'legacy-thread',
        turnId: 'legacy-turn',
        turnSeq: 1,
        expectedGeneration: 0,
        createdAt: 3,
        answerDigest: 'answer-digest',
        query: 'Legacy question',
        intent: 'unsupported',
        finalStatus: 'complete',
        snapshotHash: 'snapshot',
        evidenceJson: '{}',
        proseJson: '{}',
        artifactKindsJson: '[]',
        finalizationHash: 'finalization-hash',
        toolCalls: [],
        operationKey: 'legacy:finalize-answer',
        correlationId: 'legacy-finalize-answer-correlation',
        entries: [],
      }),
      () => admin.mutation(api.externalRuns.createManifest, { manifest: manifestInput, ...writeContext }),
      () => admin.mutation(api.externalRuns.updateManifest, { manifest: manifestInput, ...writeContext }),
      () => admin.mutation(api.externalRuns.admitStart, {
        runId: manifest.runId,
        candidate: {
          startRef: 'retired-start',
          startedAt,
          basOutcome: 'current',
          attribution: { channel: 'test' },
          consentAccepted: true,
          providerRef: 'provider-1',
          independentProviderRef: 'independent-1',
        },
        ...writeContext,
      }),
      () => admin.mutation(api.externalRuns.recordEvidence, {
        runId: manifest.runId,
        evidence: {
          evidenceRef: 'retired-evidence',
          startRef: admission.start.startRef,
          evidenceClass: 'sandbox',
          signal: 'decision_ready_within_24h',
          value: true,
          observedAt: startedAt,
        },
        ...writeContext,
      }),
      () => admin.mutation(api.externalRuns.finalizeRun, { manifest: manifestInput, ...writeContext }),
    ]

    const messages: string[] = []
    for (const call of calls) {
      try {
        await call()
        throw new Error('legacy_writer_did_not_fail')
      } catch (error) {
        if (!(error instanceof Error)) throw error
        messages.push(error.message)
      }
    }
    expect(calls).toHaveLength(15)
    expect(new Set(messages)).toEqual(new Set(['legacy_writer_retired']))
    expect(await legacySnapshot(backend)).toEqual(before)
    await expect(backend.run(async (ctx) =>
      ctx.db.system.query('_scheduled_functions').take(20)
    )).resolves.toEqual([])

    await expect(backend.query(api.answerThreads.listSessionThreads, {
      pseudonymousSessionId: 'legacy-session',
    })).resolves.toMatchObject({ threads: [{ threadId: 'legacy-thread' }] })
    await expect(backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId: 'legacy-thread',
      pseudonymousSessionId: 'legacy-session',
      paginationOpts: page,
    })).resolves.toMatchObject({
      thread: { threadId: 'legacy-thread' },
      turns: { page: [{ turnId: 'legacy-turn' }] },
    })
    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId: 'legacy-turn',
      pseudonymousSessionId: 'legacy-session',
      paginationOpts: page,
    })).resolves.toMatchObject({ page: [{ toolCallId: 'legacy-tool-call' }] })
    await expect(backend.query(api.harnessSessions.listHarnessSessionEntries, {
      sessionId: 'legacy-session',
    })).resolves.toMatchObject({ kind: 'ok', entries: [{ kind: 'session.created' }] })
    await expect(backend.query(api.harnessSessions.listHarnessRunEntries, {
      runId: 'legacy-run',
    })).resolves.toMatchObject({ kind: 'ok', entries: [{ kind: 'session.created' }] })
    await expect(admin.query(api.harnessSessions.readAdminHarnessSessionEntries, {
      sessionId: 'legacy-session',
    })).resolves.toMatchObject({ kind: 'allowed', entries: [{ entryId: 'legacy-entry' }] })
    await expect(admin.query(api.externalRuns.inspectManifest, {
      runId: manifest.runId,
    })).resolves.toMatchObject({ kind: 'accepted', manifestDigest: manifest.digest })
    await expect(admin.query(api.externalRuns.readReport, {
      runId: manifest.runId,
    })).resolves.toMatchObject({ kind: 'accepted', manifestDigest: manifest.digest })
  })
})

type Backend = TestConvex<typeof schema>

async function legacySnapshot(backend: Backend) {
  return backend.run(async (ctx) => ({
    answerThreads: await ctx.db.query('answerThreads').take(20),
    answerTurns: await ctx.db.query('answerTurns').take(20),
    answerTurnReservations: await ctx.db.query('answerTurnReservations').take(20),
    answerToolCalls: await ctx.db.query('answerToolCalls').take(20),
    answerThreadShares: await ctx.db.query('answerThreadShares').take(20),
    harnessSessions: await ctx.db.query('harnessSessions').take(20),
    harnessSessionEntries: await ctx.db.query('harnessSessionEntries').take(20),
    externalRunManifests: await ctx.db.query('externalRunManifests').take(20),
    externalRunStarts: await ctx.db.query('externalRunStarts').take(20),
    externalRunEvidence: await ctx.db.query('externalRunEvidence').take(20),
    externalRunGateDecisions: await ctx.db.query('externalRunGateDecisions').take(20),
  }))
}
