import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerThreadRecord, AnswerTurnRecord } from '@/modules/answer-thread/public'
import { loadThreadRouteReadback, Route } from '@/routes/t.$threadId'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../helpers/answer-thread-test-port'

describe('/t/$threadId route loader', () => {
  const previousConvexUrl = process.env.CONVEX_URL
  const previousPublicConvexUrl = process.env.VITE_CONVEX_URL

  afterEach(() => {
    restoreEnv('CONVEX_URL', previousConvexUrl)
    restoreEnv('VITE_CONVEX_URL', previousPublicConvexUrl)
  })

  it('does not strand a completed answer when the client transition cannot read Convex directly', async () => {
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    await expect(
      (Route.options.loader as (input: { params: { threadId: string } }) => Promise<unknown>)({
        params: { threadId: 'thr_missing_env' },
      }),
    ).resolves.toMatchObject({
      projection: null,
      seo: undefined,
    })
  })

  it('loads the first turn structured timing from the public thread projection', async () => {
    const store = createAnswerThreadTestStore()
    const thread: AnswerThreadRecord = {
      threadId: 'thr_timing',
      pseudonymousSessionId: 'session-private',
      title: 'Replace a leaking kitchen tap',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 2_000,
    }
    const turn: AnswerTurnRecord = {
      turnId: 'turn_timing',
      threadId: thread.threadId,
      seq: 1,
      query: 'Replace a leaking kitchen tap',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '/api/businesses/search?q=leaking+tap',
        searchContext: {
          mode: 'whole_catalogue',
          timing: 'date',
          timingDate: '2026-07-18',
        },
        workLog: [],
      }),
      snapshotHash: 'snapshot-private',
      proseJson: JSON.stringify({
        oneLine: 'No published business pages match yet.',
        summary: 'Try broadening the request.',
        nextStep: 'Edit the request.',
      }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 2_000,
    }
    store.threads.set(thread.threadId, thread)
    store.turns.set(turn.turnId, turn)
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const readback = await loadThreadRouteReadback(thread.threadId)
      expect(readback.projection?.turns[0]).toMatchObject({
        query: turn.query,
        timing: 'date',
        timingDate: '2026-07-18',
      })
    } finally {
      resetPort()
    }
  })
})

function restoreEnv(name: 'CONVEX_URL' | 'VITE_CONVEX_URL', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
