import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent, AnswerSource } from '@/modules/answer/public'
import {
  streamAnswerTurn,
  type AnswerTurnRecord,
} from '@/modules/answer-thread/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { finalizeAnswerTurnSnapshot } from '@/modules/answer-thread/internal/answer-turn-safety'
import { buildOfferingRetrievalSnapshot } from '@/modules/answer-thread/internal/turns/retrieval-first'

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
      getThreadTurns: async () => ({ turns: [] }),
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

  it('grounds v2 business slugs and still requires boundary copy', () => {
    const snapshot = {
      query: 'data feed',
      oneLine: 'One listed business publishes an offering.',
      providers: [],
      offeringSources: [offeringSource('profile-pair')],
      summary: 'Published details are shown.',
      nextStep: 'Review the business page.',
      agentJsonUrl: '/api/businesses/search?q=data',
    }

    expect(finalizeAnswerTurnSnapshot({
      snapshot,
      allowedSlugs: new Set(['different-business']),
    })).toMatchObject({ ok: false, code: 'grounding_failed' })
    expect(finalizeAnswerTurnSnapshot({
      snapshot,
      allowedSlugs: new Set(['profile-pair']),
    })).toMatchObject({ ok: false, code: 'boundary_missing' })
  })

  it('does not turn unknown, stale, or absent Offering facts into business confirmation', () => {
    const snapshot = buildOfferingRetrievalSnapshot({
      query: 'current data feed',
      sources: [offeringSource('profile-pair')],
      searchInput: { query: 'current data feed', limit: 3 },
      searchContext: undefined,
    })

    expect(snapshot.summary).toContain('missing, unknown, or stale')
    expect(snapshot.nextStep).toContain('Inspect each offering and business page')
    expect(`${snapshot.summary} ${snapshot.nextStep}`).not.toMatch(
      /confirms? (?:current )?fit|confirms? timing|confirms? price|confirms? access|confirms? availability/i,
    )
  })
})

function offeringSource(slug: string) {
  return {
    sourceKind: 'offering_v2' as const,
    citationIndex: 1,
    business: {
      businessId: `business:${slug}`,
      slug,
      name: 'Profile Pair',
      category: 'Data',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: `/${slug}`,
      observedAt: 1,
      disposition: 'stale' as const,
      accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
    },
    offerings: [],
    detailUrl: `/${slug}`,
  }
}

function buildUngroundedPriorTurn(): AnswerTurnRecord {
  return {
    turnId: 'prior-turn-1',
    threadId: 'thread-1',
    seq: 1,
    query: 'emergency plumber in Perth',
    intent: 'refine_search',
    evidenceJson: JSON.stringify({
      providers: [provider],
      allowedSlugs: [],
      agentJsonUrl: '/api/businesses/search?q=emergency+plumber+in+Perth&limit=3',
    }),
    snapshotHash: 'prior-hash',
    proseJson: JSON.stringify({
      oneLine: 'One listed business matches.',
      summary: 'A listed business publishes coverage. Agentic Economy does not book or take payment on this page.',
      nextStep: 'Open the provider page and send an inquiry when that option is published.',
    }),
    artifactKindsJson: '[]',
    status: 'complete',
    createdAt: 1,
  }
}
