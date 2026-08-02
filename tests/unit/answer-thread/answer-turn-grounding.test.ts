import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent, AnswerSource } from '@/modules/answer/public'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { AnswerRunReport, FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import {
  streamAnswerTurn,
  type AnswerTurnRecord,
} from '@/modules/answer-thread/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'

const provider: AnswerSource = {
  citationIndex: 1,
  slug: 'invented-provider',
  name: 'Invented Provider',
  category: 'Plumbing',
  suburb: 'Perth',
  stateTerritory: 'WA',
  serviceArea: 'Perth metro',
  hoursLabel: 'Published hours unavailable',
  availabilityLabel: 'Inquiry required',
  trustLabel: 'Listed business',
  responseTimeLabel: 'Response time not published',
  trustCue: 'Published listing only',
  nextStepLabel: 'Send inquiry',
  detailUrl: '/invented-provider',
  inquiryUrl: '/invented-provider/inquiry',
  services: [
    {
      name: 'Emergency plumbing',
      category: 'Plumbing',
      summary: 'Emergency plumbing support.',
    },
  ],
}
function currentPriorEvidence(): FrozenTurnEvidenceDraft & { answerRun: AnswerRunReport } {
  const draft: FrozenTurnEvidenceDraft = {
    providers: [provider],
    allowedSlugs: [],
    agentJsonUrl: '/api/businesses/search?q=emergency+plumber+in+Perth&limit=3',
    toolCalls: [],
    timings: [],
    workLog: [],
  }
  return {
    ...draft,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'prior-hash',
      evidence: draft,
    }),
  }
}

describe('answer turn catalog grounding', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
  })

  it('does not persist or complete-stream a snapshot with providers outside allowed slugs', async () => {
    const appended: { status?: string; evidenceJson?: string; errorCopyId?: string } = {}
    const events: AnswerEvent[] = []
    const reset = setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => {
        appended.status = args.status
        if (args.evidenceJson !== undefined) {
          appended.evidenceJson = args.evidenceJson
        }
        if (args.errorCopyId !== undefined) {
          appended.errorCopyId = args.errorCopyId
        }
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        appended.status = args.status
        if (args.evidenceJson !== undefined) {
          appended.evidenceJson = args.evidenceJson
        }
        if (args.errorCopyId !== undefined) {
          appended.errorCopyId = args.errorCopyId
        }
        return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ page: [], isDone: true, continueCursor: '' }),
    })

    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-1',
          threadId: 'thread-1',
          query: 'Can AE book this?',
          precheckedAccess: { kind: 'allowed', turnCount: 1 },
          preloadedPriorTurns: [buildUngroundedPriorTurn()],
        },
        ({ event }) => events.push(event),
      )
    } finally {
      reset()
    }

    expect(events.some((event) => event.type === 'complete')).toBe(false)
    expect(events.some((event) => event.type === 'error' && event.code === 'grounding_failed')).toBe(true)
    expect(appended.status).toBe('error')
    expect(appended.errorCopyId).toBeDefined()

    const evidence = JSON.parse(appended.evidenceJson ?? '{}') as { providers?: unknown[]; allowedSlugs?: unknown[] }
    expect(evidence.providers).toEqual([])
    expect(evidence.allowedSlugs).toEqual([])
  })
})

function buildUngroundedPriorTurn(): AnswerTurnRecord {
  return {
    turnId: 'prior-turn-1',
    threadId: 'thread-1',
    seq: 1,
    query: 'emergency plumber in Perth',
    intent: 'refine_search',
    evidenceJson: JSON.stringify(currentPriorEvidence()),
    snapshotHash: 'prior-hash',
    proseJson: JSON.stringify({
      oneLine: 'One listed business matches.',
      summary: 'A listed business publishes coverage. The business confirms timing, price, availability, and the work.',
      nextStep: 'Open the provider page and send an inquiry when that option is published.',
    }),
    artifactKindsJson: '[]',
    status: 'complete',
    createdAt: 1,
  }
}
