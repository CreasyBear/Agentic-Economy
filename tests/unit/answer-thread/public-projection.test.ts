import { describe, expect, it } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import { buildHarnessRunReport } from '@/modules/harness/public'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { buildPublicThreadProjection } from '@/modules/answer-thread/public'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { AnswerWorkStep } from '@/modules/answer/public'
import { publicWorkLog } from '@/modules/answer-thread/internal/public-worklog'
import {
  buildPublicThreadProjectionWithReservations,
  countAnswerThreadTurns,
  toReservationRecord,
  toThreadRecord,
  toTurnRecord,
} from '@/modules/answer-thread/convex'
import { emitReadAndCompareSteps } from '@/modules/answer-thread/internal/turns/types'

function withAnswerRun(evidence: FrozenTurnEvidenceDraft) {
  return {
    ...evidence,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash-secret',
      evidence,
    }),
  }
}

describe('public thread projection', () => {
  it('omits private persistence fields from the share-safe DTO', () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-1',
      pseudonymousSessionId: 'session-secret',
      title: 'plumber Preston',
      createdAt: 1_000,
      updatedAt: 2_000,
    }

    const turn: AnswerTurnRecord = {
      turnId: 'turn-1',
      threadId: 'thread-1',
      seq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify(withAnswerRun({
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
        allowedSlugs: ['preston-plumbing'],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: [],
        timings: [],
        workLog: [
          {
            id: 'interpret.request',
            phase: 'interpret',
            status: 'complete',
            title: 'Reading your request',
          },
        ],
        harnessRun: buildHarnessRunReport({
          availableTools: ['registry.search'],
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 0 }],
        }),
      })),
      snapshotHash: 'hash-secret',
      proseJson: JSON.stringify({
        oneLine: 'One listed business matches.',
        summary: 'The business handles timing, price, and availability.',
        nextStep: 'Open a provider page.',
      }),
      artifactKindsJson: '["one-line","provider-cards"]',
      status: 'complete',
      errorCopyId: 'err-secret',
      createdAt: 3_000,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    expect(projection.turns).toHaveLength(1)
    expect(projection.turns[0]?.artifacts.length).toBeGreaterThan(0)
    expect(projection.turns[0]?.workLog).toEqual([])
    expect(projection.turns[0]?.answerCheckSummary).toMatchObject({
      catalogSearches: 0,
      listingsRead: 1,
      listedBusinesses: 1,
      checksPassed: 2,
      checksFailed: 0,
    })
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('hash-secret')
    expect(serialized).not.toContain('err-secret')
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('pseudonymousSessionId')
    expect(serialized).not.toContain('allowedSlugs')
    expect(serialized).not.toContain('harnessRun')
    expect(serialized).not.toContain('toolsInvoked')
  })

  it('projects malformed durable complete data as an error', () => {
    const projection = buildPublicThreadProjection(
      {
        threadId: 'thread-corrupt',
        pseudonymousSessionId: 'session-secret',
        title: 'Corrupt answer',
        createdAt: 1,
        updatedAt: 2,
      },
      [{
        turnId: 'turn-corrupt',
        threadId: 'thread-corrupt',
        seq: 1,
        query: 'plumber Preston',
        intent: 'refine_search',
        evidenceJson: '{',
        snapshotHash: 'hash-corrupt',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 3,
      }],
    )

    expect(projection.turns[0]).toMatchObject({
      status: 'error',
      artifacts: [],
      oneLine: '',
      problem: { code: 'answer_turn_failed' },
    })
  })

  it('omits internal work phases while preserving observable work', () => {
    const steps: AnswerWorkStep[] = [
      { id: 'interpret.request', phase: 'interpret', status: 'complete', title: 'Reading your request' },
      { id: 'search.registry.initial', phase: 'search', status: 'complete', title: 'Searching for matches' },
      { id: 'route.answer', phase: 'route', status: 'complete', title: 'Choosing the next step' },
      { id: 'read.providers', phase: 'read', status: 'complete', title: 'Reading the details' },
      { id: 'assemble.answer', phase: 'assemble', status: 'complete', title: 'Putting together the answer' },
      { id: 'compare.fit', phase: 'compare', status: 'complete', title: 'Comparing the matches' },
    ]

    expect(publicWorkLog(steps)).toEqual([
      { id: 'step-1', phase: 'search', status: 'complete', title: 'Searching for matches' },
      { id: 'step-2', phase: 'read', status: 'complete', title: 'Reading the details' },
      { id: 'step-3', phase: 'compare', status: 'complete', title: 'Comparing the matches' },
    ])
  })

  it('does not fabricate read or compare work when no providers exist', () => {
    const steps: AnswerWorkStep[] = []
    emitReadAndCompareSteps(
      {
        emit: (step) => steps.push(step),
        entries: () => steps,
      },
      [],
    )

    expect(steps).toEqual([])
  })
  it('decodes host rows and preserves persisted-turn precedence over reservations', () => {
    const thread = toThreadRecord({
      threadId: 'thread-rows',
      pseudonymousSessionId: 'session-rows',
      title: 'decoded thread',
      createdAt: '1',
      updatedAt: '2',
    })
    const persisted = toTurnRecord({
      turnId: 'turn-persisted',
      threadId: 'thread-rows',
      seq: '1',
      query: 'persisted answer',
      intent: 'refine_search',
      evidenceJson: '{}',
      snapshotHash: 'snapshot',
      proseJson: '{}',
      artifactKindsJson: '[]',
      status: 'pending',
      createdAt: '3',
    })
    const reservationBase = {
      sessionId: 'session-rows',
      requestedThreadScope: 'thread-rows',
      requestDigest: 'private-digest',
      threadId: 'thread-rows',
      searchContextJson: '{}',
      createdAt: 4,
      updatedAt: 5,
    }
    const duplicateReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-duplicate',
      turnId: 'turn-persisted',
      seq: 1,
      query: 'duplicate lifecycle row',
      state: 'stopped',
    })
    const pendingReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-pending',
      turnId: 'turn-pending',
      seq: 2,
      query: 'pending lifecycle row',
      state: 'reserved',
    })
    const settledReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-settled',
      turnId: 'turn-settled',
      seq: 3,
      query: 'settled lifecycle row',
      state: 'finalized',
    })
    const rows = {
      turns: [persisted],
      reservations: [duplicateReservation, pendingReservation, settledReservation],
    }

    expect(countAnswerThreadTurns(rows, 10)).toBe(2)
    expect(buildPublicThreadProjectionWithReservations(thread, rows, 10).turns.map((turn) => ({
      turnId: turn.turnId,
      seq: turn.seq,
      query: turn.query,
      status: turn.status,
    }))).toEqual([
      { turnId: 'turn-persisted', seq: 1, query: 'persisted answer', status: 'pending' },
      { turnId: 'turn-pending', seq: 2, query: 'pending lifecycle row', status: 'pending' },
    ])
  })

})
