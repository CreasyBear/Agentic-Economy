import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import { Route } from '@/routes/t.$threadId'
import { loadThreadRouteReadback } from '@/modules/answer-thread/thread-route'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'

describe('/t/$threadId route loader', () => {

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not strand a completed answer when the client transition cannot read Convex directly', async () => {
    vi.stubEnv('CONVEX_URL', undefined)
    vi.stubEnv('VITE_CONVEX_URL', undefined)

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
      createdAt: 1_000,
      updatedAt: 2_000,
    }
    const evidenceDraft: FrozenTurnEvidenceDraft = {
      providers: [],
      allowedSlugs: [],
      agentJsonUrl: '/api/businesses/search?q=leaking+tap',
      searchContext: {
        mode: 'whole_catalogue',
        timing: 'date',
        timingDate: '2026-07-18',
      },
      toolCalls: [],
      timings: [],
      workLog: [],
    }
    const evidence = {
      ...evidenceDraft,
      answerRun: buildAnswerRunReport({
        intent: 'refine_search',
        status: 'complete',
        snapshotHash: 'snapshot-private',
        evidence: evidenceDraft,
      }),
    }
    const turn: AnswerTurnRecord = {
      turnId: 'turn_timing',
      threadId: thread.threadId,
      seq: 1,
      query: 'Replace a leaking kitchen tap',
      intent: 'refine_search',
      evidenceJson: JSON.stringify(evidence),
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
      vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', 'public.agentic.test')
      const readback = await loadThreadRouteReadback(
        thread.threadId,
        new Request(`https://public.agentic.test/t/${thread.threadId}`, {
          headers: { cookie: sessionCookieHeader(thread.pseudonymousSessionId) },
        }),
      )
      expect(readback.projection?.turns[0]).toMatchObject({
        query: turn.query,
        timing: 'date',
        timingDate: '2026-07-18',
      })
      expect(readback.seo?.canonicalUrl).toBe(`https://public.agentic.test/t/${thread.threadId}`)
    } finally {
      resetPort()
    }
  })
})

