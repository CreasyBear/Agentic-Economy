import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConvexSourceError } from '@/lib/server/convex-source'
import type { AnswerSnapshot } from '@/modules/answer/answer-synthesizer'
import type { AnswerTurnCheckpoint } from '@/modules/answer-thread/answer-thread.schema'
import { sessionCookieHeader } from '../../helpers/answer-thread-test-port'

const mocks = vi.hoisted(() => ({
  acquireAnswerTurnResumeLease: vi.fn(),
  streamAnswerTurn: vi.fn(),
}))

vi.mock('@/modules/answer-thread/server', () => ({
  acquireAnswerTurnResumeLease: mocks.acquireAnswerTurnResumeLease,
  streamAnswerTurn: mocks.streamAnswerTurn,
}))

import { handleAnswerTurnResumeRequest } from '@/routes/api.answer.turn.resume'

const answer: AnswerSnapshot = {
  query: 'current EUR to USD',
  oneLine: 'EUR to USD is available.',
  providers: [],
  summary: 'The resumed capability result was grounded in the stored tool step.',
  nextStep: 'Use the result above.',
  agentJsonUrl: '',
}

const checkpoint = {
  schemaVersion: 1,
  phase: 'selected_capability',
  stepIndex: 0,
  responseMessages: [
    { role: 'assistant', content: [{ type: 'text', text: 'The completed tool result is retained.' }] },
  ],
  toolCalls: [],
  modelRequests: [],
  timings: [],
  providers: [],
  capabilityToolNames: ['capability_frankfurter_latest'],
  modelId: 'anthropic/claude-test',
  userPrompt: 'Use the stored capability result and answer current EUR to USD.',
} as AnswerTurnCheckpoint

function request(body: unknown, options: { sessionId?: string; contentType?: string } = {}): Request {
  const sessionId = options.sessionId ?? 'owner-resume'
  return new Request('https://ae.example/api/answer/turn/resume', {
    method: 'POST',
    headers: {
      ...(options.contentType === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': options.contentType }),
      ...(sessionId.length === 0 ? {} : { cookie: sessionCookieHeader(sessionId) }),
    },
    body: JSON.stringify(body),
  })
}

function resumeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reservationKey: 'reservation-resume',
    requestDigest: 'request-resume-digest',
    threadId: 'thread-resume',
    turnId: 'turn-resume',
    turnSeq: 1,
    generation: 4,
    ...overrides,
  }
}

function acquiredLease(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'acquired',
    reservationKey: 'reservation-resume',
    threadId: 'thread-resume',
    turnId: 'turn-resume',
    turnSeq: 1,
    query: 'current EUR to USD',
    generation: 5,
    leaseOwner: 'resume-owner',
    leaseExpiresAt: Date.now() + 60_000,
    checkpoint,
    ...overrides,
  }
}

afterEach(() => {
  mocks.acquireAnswerTurnResumeLease.mockReset()
  mocks.streamAnswerTurn.mockReset()
})

describe('POST /api/answer/turn/resume', () => {
  it('resumes an owned checkpoint with the exact stored messages and no new tool input', async () => {
    let streamedInput: Record<string, unknown> | undefined
    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce(acquiredLease())
    mocks.streamAnswerTurn.mockImplementationOnce(async (input: Record<string, unknown>, send: (frame: unknown) => void) => {
      streamedInput = input
      send({ seq: 0, event: { type: 'complete', answer } })
    })

    const response = await handleAnswerTurnResumeRequest(request(resumeBody()))
    await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.acquireAnswerTurnResumeLease).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'resume',
      expectedGeneration: 4,
      sourceWriteRequest: expect.any(Request),
    }))
    expect(streamedInput).toMatchObject({
      sessionId: 'owner-resume',
      requestDigest: 'request-resume-digest',
      threadId: 'thread-resume',
      admission: {
        kind: 'replayed',
        turnId: 'turn-resume',
      },
      resume: {
        checkpoint,
        generation: 5,
        leaseOwner: 'resume-owner',
      },
    })
    expect(mocks.streamAnswerTurn).toHaveBeenCalledTimes(1)
  })

  it('conceals missing and foreign owners', async () => {
    const missing = await handleAnswerTurnResumeRequest(request(resumeBody(), { sessionId: '' }))
    expect(missing.status).toBe(404)
    expect(mocks.acquireAnswerTurnResumeLease).not.toHaveBeenCalled()

    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce({
      kind: 'conflict',
      reason: 'reservation_identity_mismatch',
    })
    const foreign = await handleAnswerTurnResumeRequest(request(resumeBody(), { sessionId: 'foreign-owner' }))
    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toMatchObject({ code: 'reservation_identity_mismatch' })
  })

  it('refuses stale generations, active leases, and non-resumable/conflicting checkpoints', async () => {
    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce({ kind: 'conflict', reason: 'generation_mismatch' })
    expect((await handleAnswerTurnResumeRequest(request(resumeBody()))).status).toBe(409)

    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce({
      kind: 'pending',
      reservationKey: 'reservation-resume',
      threadId: 'thread-resume',
      turnId: 'turn-resume',
      leaseExpiresAt: Date.now() + 60_000,
    })
    const active = await handleAnswerTurnResumeRequest(request(resumeBody()))
    expect(active.status).toBe(409)
    expect(await active.json()).toMatchObject({ code: 'lease_active' })

    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce({ kind: 'conflict', reason: 'non_resumable' })
    expect((await handleAnswerTurnResumeRequest(request(resumeBody()))).status).toBe(409)
  })

  it('replays a finalized reservation through the terminal Answer stream without a resume checkpoint', async () => {
    let streamedInput: Record<string, unknown> | undefined
    mocks.acquireAnswerTurnResumeLease.mockResolvedValueOnce({
      kind: 'settled',
      reservationKey: 'reservation-resume',
      threadId: 'thread-resume',
      turnId: 'turn-resume',
      status: 'complete',
    })
    mocks.streamAnswerTurn.mockImplementationOnce(async (input: Record<string, unknown>, send: (frame: unknown) => void) => {
      streamedInput = input
      send({ seq: 0, event: { type: 'complete', answer } })
    })

    const response = await handleAnswerTurnResumeRequest(request(resumeBody()))
    await response.text()

    expect(response.status).toBe(200)
    expect(streamedInput).toMatchObject({ admission: { state: 'finalized', kind: 'replayed' } })
    expect(streamedInput).not.toHaveProperty('resume')
  })

  it('rejects malformed bodies and media types before source access', async () => {
    const wrongType = await handleAnswerTurnResumeRequest(request(resumeBody(), { contentType: 'text/plain' }))
    expect(wrongType.status).toBe(415)
    expect(mocks.acquireAnswerTurnResumeLease).not.toHaveBeenCalled()

    const malformed = new Request('https://ae.example/api/answer/turn/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: sessionCookieHeader('owner-resume') },
      body: '{',
    })
    const malformedResponse = await handleAnswerTurnResumeRequest(malformed)
    expect(malformedResponse.status).toBe(400)
    expect(mocks.acquireAnswerTurnResumeLease).not.toHaveBeenCalled()
  })

  it('maps source-write/auth failures to sanitized RFC 9457 problem details', async () => {
    mocks.acquireAnswerTurnResumeLease.mockRejectedValueOnce(
      new ConvexSourceError('missing_auth', 'private source detail', 401),
    )

    const response = await handleAnswerTurnResumeRequest(request(resumeBody()))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      type: 'about:blank',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'missing_auth',
      detail: 'Answer service authentication is unavailable. Sign in again; local operators should restart npm run dev:local.',
    })
  })
})
