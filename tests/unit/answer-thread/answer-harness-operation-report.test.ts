import { afterEach, describe, expect, it } from 'vitest'

import {
  answerSnapshot,
  createClock,
  emptyKeylessSource,
  resetAnswerHarnessOperationAfterEach,
  toolCall,
} from './answer-harness-operation-harness'
import type { AnswerEvent } from '@/modules/answer/public'
import type { FrozenTurnEvidence } from '@/modules/answer-thread/harness'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
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
import {
  answerTurnRequestDigest,
  reserveAnswerTurn,
  streamAnswerTurn,
} from '@/modules/answer-thread/server'
import { createAnswerThreadTestStore, installAnswerThreadTestPort } from '../../helpers/answer-thread-test-port'
import { createLocalE2eRegistrySourceState } from '../../helpers/registry-local-e2e'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const resets: (() => void)[] = []

afterEach(() => {
  resetAnswerHarnessOperationAfterEach(resets)
})

describe('answer harness operation persistence bridge — finalization/report', () => {
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
    const finalizationWrites = store.finalizationWrites

    const persistInput = {
      sessionId: 'session-live',
      threadId: 'thread-live',
      isNewThread: true,
      title: 'plumber Preston',
      reservationKey: 'reservation-live',
      createdAt: 1_000,
      requestDigest: 'digest-live',
      expectedGeneration: 0,
      turnId: 'turn-live',
      turnSeq: 1,
      query: 'plumber Preston',
      intent: 'refine_search' as const,
      captured: answerSnapshot(),
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
      sourceWriteBody: '',
    }
    const persisted = await persistAnswerTurnWithResult(persistInput)
    expect(persisted.ok).toBe(true)
    const finalization = await finalizePersistedAnswerTurnHarnessRun({
      input: persistInput,
      persistResult: persisted,
      harnessRun: persisted.harnessRun,
    })
    expect(finalization.status).toBe('accepted')
    const conflictingInput = {
      ...persistInput,
      captured: { ...answerSnapshot(), summary: 'Materially changed answer.' },
    }
    const conflictingPersist = await persistAnswerTurnWithResult(conflictingInput)
    expect(conflictingPersist.ok).toBe(true)
    const conflictingFinalization = await finalizePersistedAnswerTurnHarnessRun({
      input: conflictingInput,
      persistResult: conflictingPersist,
      harnessRun: conflictingPersist.harnessRun,
    })
    expect(conflictingFinalization).toMatchObject({ status: 'conflict' })

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
    expect(finalizationWrites.every((write) => write.sourceWriteRequest?.method === 'POST')).toBe(true)

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
    const finalizationWrites = store.finalizationWrites
    const events: AnswerEvent[] = []

    resets.push(installAnswerThreadTestPort(store))
    const registryState = createLocalE2eRegistrySourceState()
    resets.push(setPublicRegistrySourcePortForTests({
      list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(registryState, input)),
      search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(registryState, input)),
      detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(registryState, input)),
    }))
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        { toolId: 'registry.search', input: { query: 'parramatta', limit: 3 } },
      ],
      prose: {
        oneLine: 'One listed business matches.',
        summary: 'Demo listed provider publishes emergency plumbing services. Scope, price, and current availability still need confirmation.',
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
          sourceWriteBody: '',
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
    expect(reportedReport?.summary.tools).toMatchObject({
      total: 1,
      ok: 1,
      byName: {
        'registry.search': expect.objectContaining({
          total: 1,
          ok: 1,
        }),
      },
    })
    // Safety preflight, then a tool round, a tool-loop stop, and AnswerProse.
    const modelRequests: { seq: number; provider: string; model: string; status: string }[]
      = reportedReport?.privateTelemetry?.modelRequests ?? []
    expect(modelRequests).toHaveLength(4)
    expect(modelRequests.map(({ seq }) => seq)).toEqual([0, 1, 2, 3])
    expect(modelRequests.every(
      ({ provider, model, status }) =>
        provider === 'openrouter' &&
        model === 'test-model' &&
        status === 'ok',
    )).toBe(true)
    expect(Object.keys(reportedReport?.summary.models?.byModel ?? {})).toEqual(['test-model'])
    expect(reportedReport?.summary.models?.byModel['test-model']).toMatchObject({
      total: 4,
      ok: 4,
    })
    expect(reportedReport?.summary.models?.byProvider.openrouter).toMatchObject({
      total: 4,
      ok: 4,
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
      ...Array.from({ length: 1 }, () => [
        'tool.started',
        'tool.completed',
      ]).flat(),
      'gate.evaluated',
      'turn.persisted',
      'run.reported',
    ])
    expect(journalKinds.filter((kind) => kind === 'model.started')).toHaveLength(1)
    expect(journalKinds.filter((kind) => kind === 'model.completed')).toHaveLength(1)
    expect(journalKinds.filter((kind) => kind === 'intent.routed')).toHaveLength(2)
    expect(journalKinds.filter((kind) => kind === 'tool.started')).toHaveLength(1)
    expect(journalKinds.filter((kind) => kind === 'tool.completed')).toHaveLength(1)
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
})
