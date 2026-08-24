import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { Route, handleAnswerTurnRequest } from '@/routes/api.answer.turn'

const RETIRED_BODY = JSON.stringify({
  type: 'about:blank',
  title: 'Answer API retired',
  status: 410,
  detail: 'This endpoint is retired. Browser users can continue at /t/new.',
  kind: 'NOT_FOUND',
  code: 'answer_api_retired',
  retryable: false,
})

function requestWithUnreadableBody(onPull: () => void): Request {
  return new Request('https://ae.example/api/answer/turn', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer hostile',
      'Content-Type': 'application/json',
      'X-AE-Turn-Key': 'hostile-turn',
    },
    body: new ReadableStream({
      pull() {
        onPull()
        throw new Error('the retired endpoint must not read this body')
      },
    }, { highWaterMark: 0 }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('retired POST /api/answer/turn', () => {
  it('returns one deterministic problem before inspecting hostile requests', async () => {
    let bodyPulls = 0
    const requests = [
      new Request('https://ae.example/api/answer/turn', { method: 'POST' }),
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json',
      }),
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'x'.repeat(128 * 1024),
      }),
      requestWithUnreadableBody(() => {
        bodyPulls += 1
      }),
    ]

    const responses = await Promise.all(requests.map(handleAnswerTurnRequest))
    const snapshots = await Promise.all(responses.map(async (response) => ({
      status: response.status,
      headers: [...response.headers.entries()],
      body: await response.text(),
    })))

    expect(snapshots).toEqual(Array.from({ length: requests.length }, () => ({
      status: 410,
      headers: [
        ['cache-control', 'no-store'],
        ['content-type', 'application/problem+json'],
      ],
      body: RETIRED_BODY,
    })))
    expect(bodyPulls).toBe(0)
  })

  it('keeps every non-POST method on the canonical 405 response', async () => {
    const handlers = Route.options.server?.handlers
    if (handlers === undefined || typeof handlers !== 'object' || handlers === null) {
      throw new Error('Answer turn handlers are missing.')
    }

    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']) {
      const handler = Reflect.get(handlers, method)
      if (typeof handler !== 'function') throw new Error(`${method} handler is missing.`)
      const response = await handler()
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
      expect(response.headers.get('content-type')).toBe('application/problem+json')
    }
  })

  it('has no retired admission, session, model, writer, or stream dependency', () => {
    const source = readFileSync(new URL('../../../src/routes/api.answer.turn.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/modules\/answer(?:-thread)?/u)
    expect(source).not.toMatch(/bounded-request-body|answer-source-error|operation-invoke-api|request-correlation|rate-limit/u)
    expect(source).not.toMatch(/\bimport\s*\(/u)
    expect(source).not.toMatch(/\b(?:admit|authenticate|operationInvokeService|stream)\s*[?:]/u)
    expect(source).not.toMatch(/readBoundedRequestText|resolveOrCreateSessionId|assertHttpAdmission|reserveAnswerTurn|streamAnswerTurn|createUIMessageStream/u)
  })
})
