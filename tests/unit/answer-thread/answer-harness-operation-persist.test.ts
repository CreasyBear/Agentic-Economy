import { afterEach, describe, expect, it } from 'vitest'

import {
  emptyKeylessSource,
  resetAnswerHarnessOperationAfterEach,
} from './answer-harness-operation-harness'
import type { AnswerEvent } from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'
import {
  answerTurnRequestDigest,
  reserveAnswerTurn,
  streamAnswerTurn,
} from '@/modules/answer-thread/server'
import { createAnswerThreadTestStore, installAnswerThreadTestPort } from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

const resets: (() => void)[] = []

afterEach(() => {
  resetAnswerHarnessOperationAfterEach(resets)
})

describe('answer harness operation persistence bridge — persist/grounding', () => {
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
          sourceWriteBody: '',
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
          sourceWriteBody: '',
          keylessExecutableSource: emptyKeylessSource,
        },
        ({ event }) => {
          if (event.type === 'work-step' && !injected) {
            injected = true
            throw new Error('ordinary model phase failure')
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

    // The safety classifier request occurs before the injected work-step
    // failure; replay below must not add any further model request.
    expect(injected).toBe(true)
    expect(server.requests).toHaveLength(1)
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
    expect(server.requests).toHaveLength(1)
  })
})
