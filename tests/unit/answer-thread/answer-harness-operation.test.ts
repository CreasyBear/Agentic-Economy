import { afterEach, describe, expect, it } from 'vitest'

import type {
  AnswerEvent,
  AnswerSnapshot,
} from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import { answerTurnRequestDigest, streamAnswerTurn } from '@/modules/answer-thread/server'
import { reserveAnswerTurn } from '@/modules/answer-thread/answer-thread.functions'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import {
  setAnswerHarnessFinalizerForTests,
  type AnswerHarnessFinalizerInput,
} from '@/modules/answer-thread/testing'
import type { AnswerToolCallRecord, FrozenTurnEvidence } from '@/modules/answer-thread/harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildHarnessRunReport,
  HarnessRunPhaseValues,
  type HarnessRuntimeEvent,
} from '@/modules/harness/public'
import {
  finalizePersistedAnswerTurnHarnessRun,
  persistAnswerTurnWithResult,
} from '@/modules/answer-thread/internal/answer-turn-finalization'
import { runAnswerHarnessOperation } from '@/modules/answer-thread/internal/answer-harness-operation'
import { createAnswerThreadTestStore, installAnswerThreadTestPort } from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const resets: (() => void)[] = []
const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

afterEach(() => {
  while (resets.length > 0) {
    resets.pop()?.()
  }
})

describe('answer harness operation persistence bridge', () => {
  it('runs the reusable answer phase spine through live HarnessRunLoop events', async () => {
    const clock = createClock()
    const events: HarnessRuntimeEvent[] = []
    let persisted = false

    const result = await runAnswerHarnessOperation({
      runId: 'turn-spine',
      sessionId: 'session-spine',
      status: 'complete',
      toolCalls: [
        toolCall('tc-search', 1, 'registry.search', 'complete', canonicalDigest('search')),
      ],
      gate: { ok: true, source: 'answer_gate' },
      fallbackReport: buildHarnessRunReport(),
      now: clock.now,
      onEvent: (event) => events.push(event),
      model: {
        provider: 'ae-test-provider',
        model: 'ae-answer-model',
        run: () => {
          clock.tick(4)
        },
      },
      persist: () => {
        persisted = true
        clock.tick(2)
      },
    })

    const phaseEvents = events.filter((event) => event.type.startsWith('phase.'))
    const toolEvents = events.filter((event) => event.type.startsWith('tool.'))

    expect(result.status).toBe('ok')
    expect(persisted).toBe(true)
    expect(result.state.visitedPhases).toEqual(HarnessRunPhaseValues)
    expect(phaseEvents.map((event) => event.type)).toEqual(
      HarnessRunPhaseValues.flatMap(() => ['phase.started', 'phase.completed']),
    )
    expect(toolEvents.map((event) => event.type)).toEqual(['tool.started', 'tool.completed'])
    expect(toolEvents).toMatchObject([
      { type: 'tool.started', toolId: 'registry.search', toolCallId: 'tc-search' },
      { type: 'tool.completed', toolId: 'registry.search', toolCallId: 'tc-search', status: 'ok' },
    ])
    expect(result.report.summary.run).toMatchObject({
      runId: 'turn-spine',
      sessionId: 'session-spine',
      status: 'ok',
    })
    expect(result.report.summary.events.byPhase).toEqual(
      expect.objectContaining(Object.fromEntries(HarnessRunPhaseValues.map((phase) => [
        phase,
        expect.objectContaining({ total: 1, ok: 1 }),
      ]))),
    )
    expect(result.report.summary.models?.byModel['ae-answer-model']).toMatchObject({
      total: 1,
      ok: 1,
      totalDurationMs: 4,
    })
    expect(result.report.summary.gates?.byName.answer_gate).toMatchObject({
      total: 1,
      ok: 1,
    })
    expect(result.report.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      ok: 1,
    })
    expect(result.report.coverage).toMatchObject({
      toolsInvoked: ['registry.search'],
      modelsUsed: ['ae-answer-model'],
      providersUsed: ['ae-test-provider'],
    })
    expect(result.report.coverage.phases).toEqual(expect.arrayContaining([...HarnessRunPhaseValues]))
  })

  it('keeps terminal run.completed status aligned with blocked answer gates', async () => {
    const events: HarnessRuntimeEvent[] = []

    const result = await runAnswerHarnessOperation({
      runId: 'turn-blocked',
      sessionId: 'session-blocked',
      status: 'complete',
      toolCalls: [
        toolCall('tc-search', 1, 'registry.search', 'complete', canonicalDigest('search')),
      ],
      modelRequests: [
        {
          seq: 0,
          provider: 'openrouter',
          model: 'anthropic/claude-test',
          status: 'ok',
          startedAt: 2_000,
          endedAt: 2_020,
          durationMs: 20,
          stopReason: 'tool_calls',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          costUnavailableReason: 'test_fixture',
        },
      ],
      gate: { ok: false, source: 'answer_gate', code: 'grounding_failed' },
      fallbackReport: buildHarnessRunReport(),
      onEvent: (event) => events.push(event),
    })

    const completed = events.find((event) => event.type === 'run.completed')

    expect(result.status).toBe('blocked')
    expect(result.report.summary.run.status).toBe('blocked')
    expect(completed).toMatchObject({
      type: 'run.completed',
      report: {
        summary: {
          run: { status: 'blocked' },
        },
      },
    })
    expect(result.report.summary.gates?.byName.answer_gate).toMatchObject({
      total: 1,
      blocked: 1,
    })
    expect(result.report.summary.errors.codes).toContain('grounding_failed')
  })
  it('persists a live-generated harness report for answer finalization phases', async () => {

    const store = createAnswerThreadTestStore()
    store.threads.set('thread-live', {
      threadId: 'thread-live',
      pseudonymousSessionId: 'session-live',
      title: 'plumber Preston',
      createdAt: 1_000,
      updatedAt: 1_000,
    })
    const reservation: AnswerTurnReservationRecord = {
      reservationKey: 'reservation-live',
      sessionId: 'session-live',
      requestedThreadScope: 'new',
      requestDigest: 'digest-live',
      threadId: 'thread-live',
      turnId: 'turn-live',
      seq: 1,
      query: 'plumber Preston',
      state: 'reserved',
      createdAt: 1_000,
      updatedAt: 1_000,
    }
    store.reservations.set(reservation.reservationKey, reservation)
    resets.push(installAnswerThreadTestPort(store))
    const finalizationWrites: AnswerHarnessFinalizerInput[] = []
    resets.push(setAnswerHarnessFinalizerForTests(async (write) => {
      finalizationWrites.push(write)
      const turn = store.turns.get(write.turnId)
      if (turn !== undefined) {
        store.turns.set(write.turnId, { ...turn, evidenceJson: write.evidenceJson, status: write.finalStatus })
      }
      const activeLeafEntryId = write.entries.at(-1)?.entryId
      return {
        status: 'accepted',
        turnId: write.turnId,
        finalizationHash: write.finalizationHash,
        entriesAccepted: write.entries.length,
        entriesReplayed: 0,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }))

    const persistInput = {
      sessionId: 'session-live',
      threadId: 'thread-live',
      isNewThread: true,
      title: 'plumber Preston',
      reservationKey: 'reservation-live',
      createdAt: 1_000,
      requestDigest: 'digest-live',
      turnId: 'turn-live',
      turnSeq: 1,
      query: 'plumber Preston',
      intent: 'refine_search' as const,
      captured: answerSnapshot(),
      errorCopyId: undefined,
      toolCalls: [
        toolCall('tc-search', 1, 'registry.search', 'complete', canonicalDigest('search')),
      ],
      modelRequests: [
        {
          seq: 0,
          provider: 'openrouter',
          model: 'anthropic/claude-test',
          status: 'ok' as const,
          startedAt: 2_000,
          endedAt: 2_020,
          durationMs: 20,
          stopReason: 'tool_calls',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          costUnavailableReason: 'test_fixture',
        },
      ],
      gate: { ok: false, source: 'answer_gate' as const, code: 'grounding_failed' },
      searchContext: undefined,
      timings: [],
      workLog: [],
      allowedSlugs: new Set(['preston-plumbing']),
      sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
        method: 'POST',
        headers: { 'X-AE-Turn-Key': 'harness:persist-live' },
      }),
    }
    const persisted = await persistAnswerTurnWithResult(persistInput)
    expect(persisted.ok).toBe(true)
    const finalization = await finalizePersistedAnswerTurnHarnessRun({
      input: persistInput,
      persistResult: persisted,
      harnessRun: persisted.harnessRun,
    })
    expect(finalization.status).toBe('accepted')
    const conflictingPersist = await persistAnswerTurnWithResult({
      ...persistInput,
      captured: { ...answerSnapshot(), summary: 'Materially changed answer.' },
    })
    expect(conflictingPersist).toMatchObject({ ok: false, failure: 'conflict' })

    const stored = store.turns.get('turn-live')
    expect(stored).toBeDefined()

    const evidence = JSON.parse(stored?.evidenceJson ?? '{}') as FrozenTurnEvidence
    expect(evidence.answerRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      complete: 1,
    })
    // The durable turn evidence no longer embeds the report inline; it points at the
    // replayed session run by ref, and the full report lives in the journal.
    expect(evidence.harnessRunRef).toBe('turn-live')
    expect(evidence.harnessRun).toBeUndefined()
    const journalEntries = finalizationWrites.flatMap((write) => write.entries)
    const reportedRun = journalEntries.find((entry) => entry.kind === 'run.reported')
    const reportedReport = reportedRun !== undefined
      ? JSON.parse(reportedRun.privatePayloadJson ?? '{}').harnessRun
      : undefined
    expect(reportedReport?.summary.run).toMatchObject({
      runId: 'turn-live',
      sessionId: 'session-live',
      status: 'blocked',
    })
    expect(reportedReport?.coverage.toolsInvoked).toEqual(['registry.search'])
    expect(reportedReport?.coverage.phases).toEqual(
      expect.arrayContaining(['assemble', 'gate', 'persist', 'report']),
    )
    expect(journalEntries.map((entry) => entry.kind)).toEqual([
      'turn.started',
      'gate.evaluated',
      'turn.persisted',
      'run.reported',
    ])
    expect(finalizationWrites.every((write) => write.request.method === 'POST')).toBe(true)

    const publicSummaries = JSON.stringify(journalEntries.map((entry) => entry.publicSummaryJson))
    expect(publicSummaries).not.toContain('registry.search')
    expect(publicSummaries).not.toContain('plumber Preston')
    expect(publicSummaries).not.toContain(canonicalDigest('search'))

    expect(reportedRun?.privatePayloadJson).toContain('harnessRun')
    expect(reportedRun?.payloadJson).toContain('registry.search')
  })

  it('streams answer turns through the live harness loop and journals runtime events directly', async () => {
    const store = createAnswerThreadTestStore()
    const turns = store.turns
    const finalizationWrites: AnswerHarnessFinalizerInput[] = []
    const events: AnswerEvent[] = []

    resets.push(installAnswerThreadTestPort(store))
    resets.push(setAnswerHarnessFinalizerForTests(async (write) => {
      finalizationWrites.push(write)
      const turn = turns.get(write.turnId)
      if (turn !== undefined) {
        turns.set(write.turnId, {
          ...turn,
          evidenceJson: write.evidenceJson,
          status: write.finalStatus,
        })
      }
      const activeLeafEntryId = write.entries.at(-1)?.entryId
      return {
        status: 'accepted',
        turnId: write.turnId,
        finalizationHash: write.finalizationHash,
        entriesAccepted: write.entries.length,
        entriesReplayed: 0,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    }))
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        { toolId: 'registry.search', input: { query: 'parramatta', limit: 3 } },
      ],
      prose: {
        oneLine: 'One listed business matches.',
        summary: 'Parramatta Emergency Plumbing publishes emergency plumbing services. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Open the listed provider page and send an inquiry when that option is published.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const requestDigest = answerTurnRequestDigest({
      query: 'paramata',
      searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
    })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-stream-live',
      query: 'paramata',
      requestDigest,
      reservationKey: 'harness:stream-live',
      title: 'paramata',
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-live',
          query: 'paramata',
          requestDigest,
          admission,
          searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'harness:stream-live' },
          }),
          keylessExecutableSource: emptyKeylessSource,
        },
        ({ event }) => events.push(event),
      )
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }

    expect(events.some((event) => event.type === 'complete')).toBe(true)

    const stored = [...turns.values()][0]
    expect(stored).toBeDefined()
    const evidence = JSON.parse(stored?.evidenceJson ?? '{}') as FrozenTurnEvidence
    // Durable evidence stores the ref; the full report is journaled by replayed run.
    expect(evidence.harnessRunRef).toBeDefined()
    expect(evidence.harnessRun).toBeUndefined()

    const journalEntries = finalizationWrites.flatMap((write) => write.entries)
    const journalKinds = journalEntries.map((entry) => entry.kind)
    const reportedReport = JSON.parse(journalEntries.find((entry) => entry.kind === 'run.reported')?.privatePayloadJson ?? '{}').harnessRun
    expect(reportedReport?.summary.run.status).toBe('ok')
    expect(reportedReport?.summary.tools.byName['registry.search']).toMatchObject({
      total: 2,
      ok: 2,
    })
    // The safety preflight is the first model request; the agent then performs
    // one tool round and one tool-less prose round.
    const modelRequests: { seq: number; provider: string; model: string; status: string }[]
      = reportedReport?.privateTelemetry?.modelRequests ?? []
    expect(modelRequests.map(({ seq, provider, model, status }) => ({ seq, provider, model, status }))).toEqual([
      { seq: 0, provider: 'openrouter', model: 'test-model', status: 'ok' },
      { seq: 1, provider: 'openrouter', model: 'test-model', status: 'ok' },
      { seq: 2, provider: 'openrouter', model: 'test-model', status: 'ok' },
    ])
    expect(Object.keys(reportedReport?.summary.models?.byModel ?? {})).toEqual(['test-model'])
    expect(reportedReport?.summary.models?.byModel['test-model']).toMatchObject({
      total: 3,
      ok: 3,
    })
    expect(reportedReport?.summary.models?.byProvider.openrouter).toMatchObject({
      total: 3,
      ok: 3,
    })
    expect(reportedReport?.coverage.phases).toEqual(
      expect.arrayContaining(['context', 'intent', 'route', 'retrieval', 'model', 'assemble', 'gate']),
    )
    expect(journalKinds).toEqual([
      'turn.started',
      'model.started',
      'model.completed',
      'context.loaded',
      'intent.routed',
      'intent.routed',
      'tool.started',
      'tool.completed',
      'tool.started',
      'tool.completed',
      'gate.evaluated',
      'turn.persisted',
      'run.reported',
    ])
    expect(journalKinds.filter((kind) => kind === 'model.started')).toHaveLength(1)
    expect(journalKinds.filter((kind) => kind === 'model.completed')).toHaveLength(1)
    expect(journalKinds.filter((kind) => kind === 'intent.routed')).toHaveLength(2)
    expect(journalKinds.filter((kind) => kind === 'tool.started')).toHaveLength(2)
    expect(journalKinds.filter((kind) => kind === 'tool.completed')).toHaveLength(2)
    expect(journalKinds).not.toContain('tool.failed')
    expect(journalEntries.find((entry) => entry.kind === 'run.reported')?.privatePayloadJson).toContain('runtimeEvent')
    expect(finalizationWrites[0]?.finalizationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(evidence.harnessFinalization).toMatchObject({
      schemaVersion: 1,
      status: 'accepted',
      journalEntryCount: journalEntries.length,
    })

    const publicSummaries = JSON.stringify(journalEntries.map((entry) => entry.publicSummaryJson))
    expect(publicSummaries).not.toContain('registry.search')
    expect(publicSummaries).not.toContain('paramata')
  })

  it('does not complete a captured stream when final harness finalization fails', async () => {
    const store = createAnswerThreadTestStore()
    const turns = store.turns
    const events: AnswerEvent[] = []

    resets.push(installAnswerThreadTestPort(store))
    resets.push(setAnswerHarnessFinalizerForTests(async () => ({
      status: 'denied',
      reason: 'foreign_origin',
      message: 'forced finalization denial',
    })))
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        { toolId: 'registry.search', input: { query: 'parramatta', limit: 3 } },
      ],
      prose: {
        oneLine: 'One listed business matches.',
        summary: 'Parramatta Emergency Plumbing publishes emergency plumbing services. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Open the listed provider page and send an inquiry when that option is published.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const requestDigest = answerTurnRequestDigest({
      query: 'parramatta plumber',
      searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
    })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-stream-finalization-fail',
      query: 'parramatta plumber',
      requestDigest,
      reservationKey: 'harness:stream-finalization-fail',
      title: 'parramatta plumber',
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-finalization-fail',
          query: 'parramatta plumber',
          requestDigest,
          admission,
          searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'harness:stream-finalization-fail' },
          }),
          keylessExecutableSource: emptyKeylessSource,
        },
        ({ event }) => events.push(event),
      )
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }

    expect([...turns.values()]).toHaveLength(1)
    expect(events.some((event) => event.type === 'complete')).toBe(false)
    expect(events.some((event) => event.type === 'error' && event.problem.code === 'answer_turn_persist_failed')).toBe(true)
    const stored = turns.get(admission.turnId)
    const reservationRow = store.reservations.get(admission.reservationKey)
    expect(stored?.status).toBe('error')
    expect(reservationRow).toMatchObject({ state: 'finalized', finalStatus: 'error' })
    const replay = await reserveAnswerTurn({
      sessionId: 'session-stream-finalization-fail',
      query: 'parramatta plumber',
      requestDigest,
      reservationKey: 'harness:stream-finalization-fail',
      title: 'parramatta plumber',
    })
    expect(replay).toMatchObject({ kind: 'replayed', state: 'finalized', finalStatus: 'error' })
  })
  it('leaves an aborted reservation pending without fabricating a durable error', async () => {
    const store = createAnswerThreadTestStore()
    resets.push(installAnswerThreadTestPort(store))
    const query = 'book now and pay today'
    const searchContext: AeSearchContext = { mode: 'whole_catalogue', allowOutsideArea: true }
    const requestDigest = answerTurnRequestDigest({ query, searchContext })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-aborted-turn',
      query,
      requestDigest,
      reservationKey: 'harness:aborted-turn',
      title: query,
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)
    const abortController = new AbortController()
    abortController.abort()
    const events: AnswerEvent[] = []

    await streamAnswerTurn(
      {
        sessionId: 'session-aborted-turn',
        query,
        requestDigest,
        admission,
        searchContext,
        signal: abortController.signal,
        keylessExecutableSource: emptyKeylessSource,
      },
      ({ event }) => events.push(event),
    )

    expect(events).toEqual([])
    expect(store.turns).toHaveLength(0)
    expect(store.reservations.get(admission.reservationKey)).toMatchObject({ state: 'reserved' })
  })

  it('recovers a transient persistence failure as one finalized durable error', async () => {
    const store = createAnswerThreadTestStore()
    store.persistErrors = [new Error('transient persist outage')]
    resets.push(installAnswerThreadTestPort(store))
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const query = 'book now and pay today'
    const searchContext: AeSearchContext = { mode: 'whole_catalogue', allowOutsideArea: true }
    const requestDigest = answerTurnRequestDigest({ query, searchContext })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-transient-persist',
      query,
      requestDigest,
      reservationKey: 'harness:transient-persist',
      title: query,
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)
    const events: AnswerEvent[] = []

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-transient-persist',
          query,
          requestDigest,
          admission,
          searchContext,
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'harness:transient-persist' },
          }),
          keylessExecutableSource: emptyKeylessSource,
        },
        ({ event }) => events.push(event),
      )
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      problem: { code: 'answer_turn_persist_failed' },
    })
    expect(store.turns.get(admission.turnId)?.status).toBe('error')
    expect(store.reservations.get(admission.reservationKey)).toMatchObject({
      state: 'finalized',
      finalStatus: 'error',
    })
    expect(store.persisted).toHaveLength(1)
    await expect(reserveAnswerTurn({
      sessionId: 'session-transient-persist',
      query,
      requestDigest,
      reservationKey: 'harness:transient-persist',
      title: query,
    })).resolves.toMatchObject({
      kind: 'replayed',
      state: 'finalized',
      finalStatus: 'error',
    })
  })

  it('durably finalizes an ordinary pre-persist phase failure and replays it without re-execution', async () => {
    const store = createAnswerThreadTestStore()
    resets.push(installAnswerThreadTestPort(store))
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta', limit: 3 } }],
      prose: {
        oneLine: 'One listed business matches.',
        summary: 'The listed business may fit the request.',
        whatToDoNow: 'Open the listed provider page.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const query = 'paramata'
    const searchContext: AeSearchContext = { mode: 'whole_catalogue', allowOutsideArea: true }
    const requestDigest = answerTurnRequestDigest({ query, searchContext })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-stream-phase-failure',
      query,
      requestDigest,
      reservationKey: 'harness:stream-phase-failure',
      title: query,
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)

    const events: AnswerEvent[] = []
    let injected = false
    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-phase-failure',
          query,
          requestDigest,
          admission,
          searchContext,
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'harness:stream-phase-failure' },
          }),
          keylessExecutableSource: emptyKeylessSource,
        },
        ({ event }) => {
          if (event.type === 'one-line' && !injected) {
            injected = true
            throw new Error('ordinary assemble phase failure')
          }
          events.push(event)
        },
      )
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }

    // The initial turn performs classifier, tool, and prose requests; replay
    // returns the durable error without re-executing any of them.
    expect(injected).toBe(true)
    expect(server.requests).toHaveLength(3)
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      problem: { code: 'answer_turn_persist_failed' },
    })
    expect([...store.turns.values()]).toHaveLength(1)
    const stored = store.turns.get(admission.turnId)
    expect(stored?.status).toBe('error')
    expect(JSON.parse(stored?.errorProblemJson ?? '{}')).toMatchObject({
      code: 'answer_turn_persist_failed',
    })
    expect(store.reservations.get(admission.reservationKey)).toMatchObject({
      state: 'finalized',
      finalStatus: 'error',
    })
    expect(store.persisted).toHaveLength(1)

    const replayAdmission = await reserveAnswerTurn({
      sessionId: 'session-stream-phase-failure',
      query,
      requestDigest,
      reservationKey: 'harness:stream-phase-failure',
      title: query,
    })
    expect(replayAdmission).toMatchObject({
      kind: 'replayed',
      state: 'finalized',
      finalStatus: 'error',
    })
    if (replayAdmission.kind !== 'replayed') throw new Error('expected finalized replay')

    const replayEvents: AnswerEvent[] = []
    await streamAnswerTurn(
      {
        sessionId: 'session-stream-phase-failure',
        query,
        requestDigest,
        admission: replayAdmission,
        searchContext,
      },
      ({ event }) => replayEvents.push(event),
    )
    expect(replayEvents.at(-1)).toMatchObject({
      type: 'error',
      problem: { code: 'answer_turn_persist_failed' },
    })
    expect(server.requests).toHaveLength(3)
  })

})

function createClock(start = 1_000): {
  now: () => number
  tick: (durationMs: number) => void
} {
  let current = start
  return {
    now: () => current,
    tick: (durationMs: number) => {
      current += durationMs
    },
  }
}

function answerSnapshot(): AnswerSnapshot {
  return {
    query: 'plumber Preston',
    oneLine: 'One listed business matches.',
    providers: [
      {
        citationIndex: 1,
        slug: 'preston-plumbing',
        name: 'Preston Plumbing',
        category: 'Plumber',
        suburb: 'Preston',
        stateTerritory: 'VIC',
        serviceArea: 'Preston',
        hoursLabel: 'Hours supplied',
        availabilityLabel: 'Published',
        trustLabel: 'Checked',
        responseTimeLabel: '',
        trustCue: 'Checked',
        nextStepLabel: 'Send inquiry',
        detailUrl: '/preston-plumbing',
        services: [],
      },
    ],
    summary: 'Preston Plumbing publishes service coverage.',
    nextStep: 'Open the provider page and send an inquiry when that option is published.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
  }
}

function toolCall(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  status: AnswerToolCallRecord['status'],
  resultHash: string,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: 'turn-live',
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: '{"slugs":["preston-plumbing"],"count":1}',
    resultJson: '{"kind":"ok","items":[{"slug":"preston-plumbing"}]}',
    resultHash,
    status,
    createdAt: 1_000,
  }
}
