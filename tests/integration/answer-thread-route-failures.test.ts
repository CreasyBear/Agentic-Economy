import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleGetAnswerThreadRequest, handleDeleteAnswerThreadRequest } from '@/routes/api.answer.threads.$threadId'
import { handleListAnswerThreadsRequest } from '@/routes/api.answer.threads'
import {
  handleIssueAnswerThreadShareRequest,
  handleRevokeAnswerThreadShareRequest,
} from '@/routes/api.answer.threads.$threadId.share'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'

describe('answer thread route failure boundaries', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a retryable problem instead of an empty 200 when listing fails', async () => {
    const store = createAnswerThreadTestStore()
    store.listSessionThreadsError = new Error('source list unavailable')
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const response = await handleListAnswerThreadsRequest(
        new Request('https://ae.example/api/answer/threads', {
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
      )

      expect(response.status).toBe(503)
      const body = (await response.json()) as Record<string, unknown>
      expect(body).toMatchObject({ kind: 'UNAVAILABLE', code: 'unavailable', retryable: true })
      expect(JSON.stringify(body)).not.toContain('source list unavailable')
    } finally {
      resetPort()
    }
  })

  it('keeps owner absence concealed but redacts unexpected detail and delete failures', async () => {
    const readStore = createAnswerThreadTestStore()
    readStore.getOwnedThreadProjectionError = new Error('convex read outage')
    const resetReadPort = installAnswerThreadTestPort(readStore)

    try {
      const readResponse = await handleGetAnswerThreadRequest(
        new Request('https://ae.example/api/answer/threads/thread-1', {
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(readResponse.status).toBe(503)
      const readBody = (await readResponse.json()) as Record<string, unknown>
      expect(readBody).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'unavailable',
        retryable: true,
      })
      expect(JSON.stringify(readBody)).not.toContain('convex read outage')
    } finally {
      resetReadPort()
    }

    const deleteStore = createAnswerThreadTestStore()
    deleteStore.deleteThreadError = new Error('convex delete outage')
    const resetDeletePort = installAnswerThreadTestPort(deleteStore)

    try {
      const deleteResponse = await handleDeleteAnswerThreadRequest(
        new Request('https://ae.example/api/answer/threads/thread-1', {
          method: 'DELETE',
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(deleteResponse.status).toBe(503)
      expect((await deleteResponse.json()) as Record<string, unknown>).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'unavailable',
        retryable: true,
      })
    } finally {
      resetDeletePort()
    }

    const absentStore = createAnswerThreadTestStore()
    const resetAbsentPort = installAnswerThreadTestPort(absentStore)
    try {
      const absentResponse = await handleGetAnswerThreadRequest(
        new Request('https://ae.example/api/answer/threads/thread-1', {
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(absentResponse.status).toBe(404)
    } finally {
      resetAbsentPort()
    }
  })

  it('uses a sanitized missing-secret code and preserves idempotent revoke', async () => {
    const failureStore = createAnswerThreadTestStore()
    failureStore.issueShareError = new Error('AE_ANSWER_THREAD_SHARE_SECRET must contain at least 32 characters.')
    const resetFailurePort = installAnswerThreadTestPort(failureStore)

    try {
      const response = await handleIssueAnswerThreadShareRequest(
        new Request('https://ae.example/api/answer/threads/thread-1/share', {
          method: 'POST',
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(response.status).toBe(503)
      const body = (await response.json()) as Record<string, unknown>
      expect(body).toMatchObject({ kind: 'UNAVAILABLE', code: 'missing_share_secret' })
      expect(JSON.stringify(body)).not.toContain('AE_ANSWER_THREAD_SHARE_SECRET')
      failureStore.issueShareError = new Error('convex share outage')
      const unexpectedResponse = await handleIssueAnswerThreadShareRequest(
        new Request('https://ae.example/api/answer/threads/thread-1/share', {
          method: 'POST',
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(unexpectedResponse.status).toBe(503)
      expect(await unexpectedResponse.json()).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'unavailable',
        retryable: true,
      })
    } finally {
      resetFailurePort()
    }

    const revokeStore = createAnswerThreadTestStore()
    revokeStore.threads.set('thread-1', {
      threadId: 'thread-1',
      pseudonymousSessionId: 'owner-1',
      title: 'Saved answer',
      createdAt: 1,
      updatedAt: 1,
    })
    const resetRevokePort = installAnswerThreadTestPort(revokeStore)

    try {
      const response = await handleRevokeAnswerThreadShareRequest(
        new Request('https://ae.example/api/answer/threads/thread-1/share', {
          method: 'DELETE',
          headers: { cookie: sessionCookieHeader('owner-1') },
        }),
        'thread-1',
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ threadId: 'thread-1', revoked: false })
    } finally {
      resetRevokePort()
    }
  })
})
