import { afterEach, describe, expect, it } from 'vitest'

import type {
  AnswerEvent,
  AnswerSnapshot,
} from '@/modules/answer/public'
import type { AnswerTurnRecord } from '@/modules/answer-thread/public'
import { streamAnswerTurn } from '@/modules/answer-thread/public'
import {
  setAnswerHarnessFinalizerForTests,
  setAnswerHarnessSessionJournalWriterForTests,
  type AnswerHarnessFinalizerInput,
  setAnswerThreadPortForTests,
  type AnswerHarnessSessionJournalWriteInput,
} from '@/modules/answer-thread/testing'
import type { AnswerToolCallRecord, FrozenTurnEvidence } from '@/modules/answer-thread/harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildHarnessRunReport,
  HarnessRunPhaseValues,
  type HarnessRuntimeEvent,
} from '@/modules/harness/public'
import { runAnswerHarnessOperation } from '@/modules/answer-thread/internal/answer-harness-operation'
import { persistAnswerTurn } from '@/modules/answer-thread/internal/answer-turn-finalization'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const resets: (() => void)[] = []

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
    const turns = new Map<string, AnswerTurnRecord>()
    const journalWrites: AnswerHarnessSessionJournalWriteInput[] = []
    resets.push(setAnswerThreadPortForTests({
      createThread: async (args) => {
        return { threadId: args.threadId }
      },
      appendTurn: async (args) => {
        turns.set(args.turnId, {
          ...args,
          createdAt: 1_000,
        })
        return { turnId: args.turnId }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ page: [...turns.values()], isDone: true, continueCursor: '' }),
    }))
    resets.push(setAnswerHarnessSessionJournalWriterForTests(async (write) => {
      journalWrites.push(write)
      return {
        status: 'accepted',
        entry: {
          entryId: write.entry.entryId,
          sessionId: write.entry.sessionId,
          runId: write.entry.runId,
          ...(write.entry.turnId === undefined ? {} : { turnId: write.entry.turnId }),
          seq: journalWrites.length,
          ...(write.entry.parentEntryId === undefined ? {} : { parentEntryId: write.entry.parentEntryId }),
          kind: write.entry.kind,
          ...(write.entry.status === undefined ? {} : { status: write.entry.status }),
          idempotencyKey: write.entry.idempotencyKey ?? write.entry.entryId,
          createdAt: write.entry.createdAt,
        },
        activeLeafEntryId: write.entry.entryId,
      }
    }))

    const persisted = await persistAnswerTurn({
      sessionId: 'session-live',
      threadId: 'thread-live',
      isNewThread: true,
      title: 'plumber Preston',
      turnId: 'turn-live',
      turnSeq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
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
      searchContext: undefined,
      timings: [],
      workLog: [],
      allowedSlugs: new Set(['preston-plumbing']),
      sourceWriteRequest: new Request('https://ae.test/api/answer/turn', { method: 'POST' }),
    })

    expect(persisted).toBe(true)
    const stored = turns.get('turn-live')
    expect(stored).toBeDefined()

    const evidence = JSON.parse(stored?.evidenceJson ?? '{}') as FrozenTurnEvidence
    expect(evidence.answerRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      complete: 1,
    })
    expect(evidence.harnessRun?.summary.run).toMatchObject({
      runId: 'turn-live',
      sessionId: 'session-live',
      status: 'blocked',
    })
    expect(evidence.harnessRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      ok: 1,
    })
    expect(evidence.harnessRun?.summary.events.byPhase).toMatchObject({
      assemble: { total: 1, ok: 1 },
      persist: { total: 1, ok: 1 },
      report: { total: 1, ok: 1 },
    })
    expect(evidence.harnessRun?.summary.gates?.byName.answer_gate).toMatchObject({
      total: 1,
      blocked: 1,
    })
    expect(evidence.harnessRun?.summary.models?.byModel['anthropic/claude-test']).toMatchObject({
      total: 1,
      ok: 1,
      totalDurationMs: 20,
    })
    expect(evidence.harnessRun?.summary.usage?.totalTokens).toBe(15)
    expect(evidence.harnessRun?.privateTelemetry?.modelRequests).toHaveLength(1)
    expect(evidence.harnessRun?.summary.errors.codes).toContain('grounding_failed')
    expect(evidence.harnessRun?.coverage.toolsInvoked).toEqual(['registry.search'])
    expect(evidence.harnessRun?.coverage.phases).toEqual(
      expect.arrayContaining(['assemble', 'gate', 'persist', 'report']),
    )
    expect(journalWrites.map((write) => write.entry.kind)).toEqual([
      'turn.started',
      'gate.evaluated',
      'turn.persisted',
      'run.reported',
    ])
    expect(journalWrites.every((write) => write.request.method === 'POST')).toBe(true)

    const publicSummaries = JSON.stringify(journalWrites.map((write) => write.entry.publicSummaryJson))
    expect(publicSummaries).not.toContain('registry.search')
    expect(publicSummaries).not.toContain('plumber Preston')
    expect(publicSummaries).not.toContain(canonicalDigest('search'))

    const reportedRun = journalWrites.find((write) => write.entry.kind === 'run.reported')?.entry
    expect(reportedRun?.privatePayloadJson).toContain('harnessRun')
    expect(reportedRun?.payloadJson).toContain('registry.search')
  })

  it('streams answer turns through the live harness loop and journals runtime events directly', async () => {
    const turns = new Map<string, AnswerTurnRecord>()
    const finalizationWrites: AnswerHarnessFinalizerInput[] = []
    const events: AnswerEvent[] = []

    resets.push(setAnswerThreadPortForTests({
      createThread: async (args) => {
        return { threadId: args.threadId }
      },
      appendTurn: async (args) => {
        turns.set(args.turnId, {
          ...args,
          createdAt: 1_000,
        })
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        const { toolCalls: _toolCalls, ...turnArgs } = args
        turns.set(args.turnId, {
          ...turnArgs,
          createdAt: 1_000,
        })
        return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ page: [], isDone: true, continueCursor: '' }),
    }))
    resets.push(setAnswerHarnessFinalizerForTests(async (write) => {
      finalizationWrites.push(write)
      const turn = turns.get(write.turnId)
      if (turn !== undefined) {
        turns.set(write.turnId, {
          ...turn,
          evidenceJson: write.evidenceJson,
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
        summary: 'Parramatta Emergency Plumbing publishes service coverage. The business confirms timing, price, availability, and the work.',
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

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-live',
          query: 'paramata',
          searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
          precheckedAccess: { kind: 'allowed', turnCount: 0 },
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', { method: 'POST' }),
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
    expect(evidence.harnessRun?.summary.run.status).toBe('ok')
    expect(evidence.harnessRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 2,
      ok: 2,
    })
    expect(evidence.harnessRun?.summary.models?.byProvider.openrouter).toMatchObject({
      total: 1,
      ok: 1,
    })
    expect(evidence.harnessRun?.coverage.phases).toEqual(
      expect.arrayContaining(['context', 'intent', 'route', 'retrieval', 'model', 'assemble', 'gate']),
    )

    const journalEntries = finalizationWrites.flatMap((write) => write.entries)
    const journalKinds = journalEntries.map((entry) => entry.kind)
    expect(journalKinds).toEqual(expect.arrayContaining([
      'turn.started',
      'context.loaded',
      'intent.routed',
      'tool.started',
      'tool.completed',
      'model.started',
      'model.completed',
      'gate.evaluated',
      'turn.persisted',
      'run.reported',
    ]))
    expect(journalKinds.filter((kind) => kind === 'tool.completed')).toHaveLength(2)
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
    const turns = new Map<string, AnswerTurnRecord>()
    const events: AnswerEvent[] = []

    resets.push(setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => {
        turns.set(args.turnId, { ...args, createdAt: 1_000 })
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        const { toolCalls: _toolCalls, ...turnArgs } = args
        turns.set(args.turnId, { ...turnArgs, createdAt: 1_000 })
        return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ page: [], isDone: true, continueCursor: '' }),
    }))
    resets.push(setAnswerHarnessFinalizerForTests(async () => ({
      status: 'error',
      reason: 'source_write_failed',
      message: 'forced finalization failure',
    })))
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [
        { toolId: 'registry.search', input: { query: 'parramatta', limit: 3 } },
      ],
      prose: {
        oneLine: 'One listed business matches.',
        summary: 'Parramatta Emergency Plumbing publishes service coverage. The business confirms timing, price, availability, and the work.',
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

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-stream-finalization-fail',
          query: 'parramatta plumber',
          searchContext: { mode: 'whole_catalogue', allowOutsideArea: true },
          precheckedAccess: { kind: 'allowed', turnCount: 0 },
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', { method: 'POST' }),
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
    expect(events.some((event) => event.type === 'error' && event.code === 'answer_turn_persist_failed')).toBe(true)
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
