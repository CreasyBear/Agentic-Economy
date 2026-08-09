import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent, AnswerSource } from '@/modules/answer/public'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { AnswerRunReport, FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { answerTurnRequestDigest, streamAnswerTurn } from '@/modules/answer-thread/server'
import { reserveAnswerTurn } from '@/modules/answer-thread/answer-thread.functions'
import type { AnswerTurnRecord } from '@/modules/answer-thread/public'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'
const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

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
  it('emits one terminal refusal only after durable persistence', async () => {
    const observed: {
      event: AnswerEvent
      durableStatus: AnswerTurnRecord['status'] | undefined
      reservationState: AnswerTurnReservationRecord['state'] | undefined
    }[] = []
    const store = createAnswerThreadTestStore()
    store.threads.set('thread-1', {
      threadId: 'thread-1',
      pseudonymousSessionId: 'session-1',
      title: 'emergency plumber in Perth',
      createdAt: 1,
      updatedAt: 1,
    })
    store.turns.set('prior-turn-1', buildUngroundedPriorTurn())
    const reset = installAnswerThreadTestPort(store)
    const requestDigest = answerTurnRequestDigest({
      threadId: 'thread-1',
      query: 'Can AE book this?',
    })
    const admission = await reserveAnswerTurn({
      sessionId: 'session-1',
      threadId: 'thread-1',
      query: 'Can AE book this?',
      requestDigest,
      reservationKey: 'grounding:session-1:turn-1',
      title: 'Can AE book this?',
    })
    if (admission.kind !== 'reserved') throw new Error(`fixture reservation ${admission.kind}`)

    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'No prose should be needed for this boundary.',
        summary: 'No prose should be needed for this boundary.',
        whatToDoNow: 'Ask a supported question.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    try {
      await streamAnswerTurn(
        {
          sessionId: 'session-1',
          threadId: 'thread-1',
          query: 'Can AE book this?',
          requestDigest,
          admission,
          keylessExecutableSource: emptyKeylessSource,
          preloadedPriorTurns: [buildUngroundedPriorTurn()],
          sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
            method: 'POST',
            headers: { 'X-AE-Turn-Key': 'grounding:turn-1' },
          }),
        },
        ({ event }) => {
          const turn = store.turns.get(admission.turnId)
          const reservation = store.reservations.get(admission.reservationKey)
          observed.push({
            event,
            durableStatus: turn?.status,
            reservationState: reservation?.state,
          })
        },
      )
    } finally {
      restoreOpenRouter()
      await server.close()
      reset()
    }

    const storedTurn = [...store.turns.values()].find((turn) => turn.turnId !== 'prior-turn-1')
    const terminalFrames = observed.filter(({ event }) =>
      event.type === 'complete' || event.type === 'error' || event.type === 'stopped',
    )
    expect(terminalFrames).toHaveLength(1)
    expect(observed.at(-1)).toBe(terminalFrames[0])
    expect(terminalFrames[0]).toMatchObject({
      event: { type: 'error', problem: { code: 'grounding_failed' } },
      durableStatus: 'error',
      reservationState: 'finalized',
    })
    expect(storedTurn?.status).toBe('error')
    expect(storedTurn?.errorProblemJson).toBeDefined()

    const evidence = JSON.parse(storedTurn?.evidenceJson ?? '{}') as {
      providers?: unknown[]
      allowedSlugs?: unknown[]
    }
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
