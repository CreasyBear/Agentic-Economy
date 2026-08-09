import { describe, expect, it, vi } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import { stopAnswerTurnRequest } from '@/components/ae/chat/turn-stop'

describe('browser Stop transport', () => {
  it('rejects a malformed RFC problem body as a protocol failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...buildAnswerTurnProblem('thread_not_found'),
      detail: 'private source detail',
    }, { status: 404 })))

    await expect(stopAnswerTurnRequest({ threadId: 'thread:1', turnId: 'turn:1' })).resolves.toEqual({
      kind: 'transport_error',
      error: expect.objectContaining({ kind: 'protocol', code: 'malformed_problem' }),
    })
  })

  it('keeps a strict not-found problem distinct from a malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      buildAnswerTurnProblem('thread_not_found'),
      { status: 404 },
    )))

    await expect(stopAnswerTurnRequest({ threadId: 'thread:1', turnId: 'turn:1' })).resolves.toEqual({ kind: 'not_found' })
  })
})
