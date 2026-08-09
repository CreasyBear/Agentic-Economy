import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { readAnswerThreadProjection } from '@/components/ae/chat/thread-readback'

const provider = {
  citationIndex: 1,
  slug: 'plumber-one',
  name: 'Plumber One',
  category: 'Plumbing',
  suburb: 'Perth',
  stateTerritory: 'WA',
  serviceArea: 'Perth',
  hoursLabel: 'Open today',
  availabilityLabel: 'Available',
  trustLabel: 'Listed',
  responseTimeLabel: 'Replies today',
  trustCue: 'Published profile',
  nextStepLabel: 'Request a quote',
  detailUrl: '/business/plumber-one',
  services: [{ name: 'Blocked drain', category: 'Plumbing', summary: 'Drain clearing' }],
}

const completeTurn = {
  turnId: 'turn:1',
  seq: 0,
  query: 'blocked drain',
  intent: 'refine_search' as const,
  status: 'complete' as const,
  workLog: [{ id: 'step-1', phase: 'search' as const, status: 'complete' as const, title: 'Finding matches' }],
  artifacts: [{ kind: 'one-line' as const, text: 'Plumber One can help.' }],
  oneLine: 'Plumber One can help.',
}

function projection(overrides: Partial<PublicThreadProjection['turns'][number]> = {}): PublicThreadProjection {
  return {
    threadId: 'thread:1',
    title: 'Blocked drain',
    turns: [{ ...completeTurn, ...overrides }],
  }
}

function stubReadback(body: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => (
    body === undefined ? new Response(null, { status }) : Response.json(body, { status })
  )))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('answer thread durable readback boundary', () => {
  it('returns a validated projection for every current lifecycle field', async () => {
    const input = projection({
      answerCheckSummary: {
        catalogSearches: 1,
        listingsRead: 1,
        listedBusinesses: 1,
        checksPassed: 1,
        checksFailed: 0,
        elapsedMs: 12,
      },
      layoutProfile: 'discovery_full',
      timing: 'today',
      createdAt: 123,
    })
    stubReadback(input)

    await expect(readAnswerThreadProjection('thread:1')).resolves.toEqual({ kind: 'ok', projection: input })
  })

  it('rejects bogus status and malformed lifecycle payloads as protocol errors', async () => {
    const malformedBodies: unknown[] = [
      projection({ status: 'bogus' as never }),
      projection({ workLog: [{} as never] }),
      projection({ artifacts: [{ kind: 'unknown' } as never] }),
      projection({
        status: 'error',
        problem: { ...buildAnswerTurnProblem('answer_turn_failed'), copyId: 'private' } as never,
      }),
    ]

    for (const body of malformedBodies) {
      stubReadback(body)
      await expect(readAnswerThreadProjection('thread:1')).resolves.toMatchObject({
        kind: 'transport_error',
        error: { kind: 'protocol', code: 'malformed_problem' },
      })
    }
  })

  it('does not turn a malformed non-2xx problem into a failed answer', async () => {
    stubReadback({ code: 'private_provider_failure', detail: 'secret' }, 503)

    await expect(readAnswerThreadProjection('thread:1')).resolves.toMatchObject({
      kind: 'transport_error',
      error: { kind: 'protocol', code: 'malformed_problem' },
    })
  })

  it('preserves existence-hiding 404 and canonical problem failures', async () => {
    stubReadback(undefined, 404)
    await expect(readAnswerThreadProjection('thread:1')).resolves.toEqual({ kind: 'not_found' })

    const problem = buildAnswerTurnProblem('rate_limited')
    stubReadback(problem, 429)
    await expect(readAnswerThreadProjection('thread:1')).resolves.toEqual({ kind: 'failed', problem })
  })
})
