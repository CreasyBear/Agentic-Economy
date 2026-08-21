import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import type { AnswerTurnFrame } from '@/modules/answer/public'
import { runAskCommand } from '../../../tools/ae/commands/ask'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import {
  answerTurnResponse,
  captureStdout,
  rawAnswerEvent,
  spawnCli,
  startAnswerServer,
} from './cli-errors-harness'

describe('market-terminal CLI error contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('projects an ask problem response into a typed safe failure without raw JSON', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthenticated',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'missing_auth',
      detail: 'An owner session is required for this answer request.',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-AE-Turn-Key')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      return new Response(JSON.stringify(problem), {
        status: 401,
        headers: { 'content-type': 'application/problem+json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const options: CliOptions = {
      baseUrl: 'http://example.test',
      json: true,
      help: false,
      allowWrite: false,
      apply: false,
    }
    let thrown: unknown
    try {
      await runAskCommand(['what', 'is', 'available?'], options)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('UNAUTHENTICATED')
    expect(thrown.code).toBe('missing_auth')
    expect(thrown.message).toBe('Unauthenticated (401)')
    expect(thrown.detail).toEqual(problem)
    expect(thrown.detail).not.toHaveProperty('copyId')
  })

  it('projects an ask rate-limit problem by code when the HTTP copy is the generic limiter detail', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Resource exhausted',
      status: 429,
      kind: 'RESOURCE_EXHAUSTED',
      code: 'rate_limited',
      detail: 'Rate limit exceeded. Please retry later.',
      retryable: true,
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(problem), {
      status: 429,
      headers: { 'content-type': 'application/problem+json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const options: CliOptions = {
      baseUrl: 'http://example.test',
      json: true,
      help: false,
      allowWrite: false,
      apply: false,
    }
    let thrown: unknown
    try {
      await runAskCommand(['emergency', 'plumber', 'parramatta'], options)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('RESOURCE_EXHAUSTED')
    expect(thrown.code).toBe('rate_limited')
    expect(thrown.message).toBe('Resource exhausted (429)')
    expect(thrown.detail).toEqual(buildAnswerTurnProblem('rate_limited'))
    expect(JSON.stringify(thrown)).not.toContain('Rate limit exceeded. Please retry later.')
  })

  it('posts a thread-scoped exact operation selection with its frozen candidate digest', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const candidateSetDigest = `sha256:${'b'.repeat(64)}`
    const selectionInput = { city: 'Darwin' }
    const selectionQuery = JSON.stringify({ operationRef, input: selectionInput, candidateSetDigest })
    const frames: AnswerTurnFrame[] = [
      {
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:cli-follow-up',
          turnId: 'turn:cli-follow-up',
          turnSeq: 2,
        },
      },
      {
        seq: 1,
        event: {
          type: 'complete',
          answer: {
            query: selectionQuery,
            oneLine: 'Selected operation completed.',
            summary: 'The selected operation was run.',
            nextStep: 'Review the result.',
            providers: [],
            agentJsonUrl: '/api/agent',
          },
        },
      },
    ]
    let requestBody: unknown
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return answerTurnResponse(frames)
    })
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runAskCommand([JSON.stringify(selectionInput)], {
        baseUrl: 'http://example.test',
        json: true,
        help: false,
        allowWrite: false,
        apply: false,
        threadId: 'thread:prior',
        operationRef,
        candidateDigest: candidateSetDigest,
      })
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(requestBody).toEqual({ threadId: 'thread:prior', query: selectionQuery })
    expect(JSON.parse(output.read())).toMatchObject({
      thread: { threadId: 'thread:cli-follow-up' },
      status: 'complete',
    })
  })

  it('posts a natural-language query with only the prior thread identity', async () => {
    const frames: AnswerTurnFrame[] = [
      {
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:cli-follow-up',
          turnId: 'turn:cli-follow-up',
          turnSeq: 3,
        },
      },
      {
        seq: 1,
        event: {
          type: 'complete',
          answer: {
            query: 'What about ethereum in USD?',
            oneLine: 'Ethereum is currently priced in USD.',
            summary: 'The current quote was read from the selected operation.',
            nextStep: 'Ask another question in this thread.',
            providers: [],
            agentJsonUrl: '/api/agent',
          },
        },
      },
    ]
    let requestBody: unknown
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return answerTurnResponse(frames)
    })
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runAskCommand(['What', 'about', 'ethereum', 'in', 'USD?'], {
        baseUrl: 'http://example.test',
        json: true,
        help: false,
        allowWrite: false,
        apply: false,
        threadId: 'thread:prior',
      })
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(requestBody).toEqual({
      threadId: 'thread:prior',
      query: 'What about ethereum in USD?',
    })
    expect(JSON.parse(output.read())).toMatchObject({
      thread: { threadId: 'thread:cli-follow-up' },
      status: 'complete',
    })
  })

  it('persists the origin-scoped Answer session and sends it on continuation', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'ae-cli-answer-session-'))
    vi.stubEnv('AE_CLI_STATE_DIR', stateDir)
    const frames: AnswerTurnFrame[] = [
      {
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:owned',
          turnId: 'turn:owned',
          turnSeq: 0,
        },
      },
      {
        seq: 1,
        event: {
          type: 'complete',
          answer: {
            query: 'Answer',
            oneLine: 'Answer.',
            summary: 'Answer.',
            nextStep: 'Continue.',
            providers: [],
            agentJsonUrl: '/api/agent',
          },
        },
      },
    ]
    const cookies: (string | null)[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      cookies.push(new Headers(init?.headers).get('cookie'))
      const response = answerTurnResponse(frames)
      return cookies.length === 1
        ? new Response(response.body, {
            status: response.status,
            headers: [...response.headers, ['Set-Cookie', 'ae_session=session-owned; Path=/; HttpOnly; SameSite=Lax']],
          })
        : response
    })
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    const options: CliOptions = {
      baseUrl: 'http://example.test',
      json: true,
      help: false,
      allowWrite: false,
      apply: false,
    }
    try {
      await runAskCommand(['First'], options)
      await runAskCommand(['Continue'], { ...options, threadId: 'thread:owned' })
    } finally {
      output.restore()
      vi.unstubAllEnvs()
      rmSync(stateDir, { recursive: true, force: true })
    }

    expect(cookies).toEqual([null, 'ae_session=session-owned'])
  })

  it('projects successful ask JSON and human output without raw event arrays', async () => {
    const frames: AnswerTurnFrame[] = [
      {
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:cli-success',
          turnId: 'turn:cli-success',
          turnSeq: 0,
        },
      },
      {
        seq: 1,
        event: {
          type: 'work-step',
          step: {
            id: 'step-1',
            phase: 'search',
            status: 'complete',
            title: 'Found matches',
            summary: 'One safe match.',
          },
        },
      },
      {
        seq: 2,
        event: {
          type: 'complete',
          answer: {
            query: 'what is available?',
            oneLine: 'A safe answer.',
            summary: 'A safe summary.',
            nextStep: 'Ask the business.',
            providers: [],
            agentJsonUrl: '/api/agent?q=what+is+available',
          },
        },
      },
    ]
    const server = await startAnswerServer(frames)
    try {
      for (const json of [true, false]) {
        const result = await spawnCli([
          '--base-url',
          server.baseUrl,
          'demand',
          'ask',
          'what',
          'is',
          'available?',
          ...(json ? ['--json'] : []),
        ])

        expect(result.status).toBe(0)
        expect(result.signal).toBeNull()
        expect(result.stderr).toBe('')
        if (json) {
          const output = JSON.parse(result.stdout)
          expect(output).toMatchObject({
            query: 'what is available?',
            thread: {
              threadId: 'thread:cli-success',
              turnId: 'turn:cli-success',
              turnSeq: 0,
            },
            status: 'complete',
            workSteps: [{
              id: 'step-1',
              phase: 'search',
              status: 'complete',
              title: 'Found matches',
              summary: 'One safe match.',
            }],
            result: {
              oneLine: 'A safe answer.',
              summary: 'A safe summary.',
              nextStep: 'Ask the business.',
            },
          })
          expect(output).not.toHaveProperty('events')
          expect(output).not.toHaveProperty('answer')
          expect(output).not.toHaveProperty('providers')
        } else {
          expect(result.stdout).toContain('status: complete')
          expect(result.stdout).toContain('thread thread:cli-success')
          expect(result.stdout).toContain('turn turn:cli-success (#0)')
          expect(result.stdout).toContain('step step-1 (search/complete) Found matches: One safe match.')
          expect(result.stdout).toContain('result: A safe answer.')
          expect(result.stdout).not.toContain('JSON.stringify')
        }
      }
    } finally {
      await server.close()
    }
  }, 30_000)

  it('keeps stream error JSON and human output typed and redacted', async () => {
    const secret = 'provider-model-tool-private-error-secret'
    const frames: AnswerTurnFrame[] = [
      {
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:cli-error',
          turnId: 'turn:cli-error',
          turnSeq: 2,
        },
      },
      {
        seq: 1,
        event: {
          type: 'work-step',
          step: {
            id: 'step-error',
            phase: 'search',
            status: 'error',
            title: 'Search failed',
            summary: 'The safe failure summary.',
          },
        },
      },
      {
        seq: 2,
        event: rawAnswerEvent('error', {
          problem: {
            type: 'https://agentic-economy.invalid/problems/private',
            title: 'Private upstream failure',
            status: 500,
            kind: 'INTERNAL',
            code: 'grounding_failed',
            detail: `raw detail ${secret}`,
            copyId: 'private-copy-id',
          },
          privateErrorPayload: secret,
        }),
      },
    ]
    const server = await startAnswerServer(frames)
    try {
      for (const json of [true, false]) {
        const result = await spawnCli([
          '--base-url',
          server.baseUrl,
          'demand',
          'ask',
          'what',
          'failed?',
          ...(json ? ['--json'] : []),
        ])

        expect(result.status).toBe(1)
        expect(result.signal).toBeNull()
        expect(result.stdout).not.toContain(secret)
        expect(result.stderr).not.toContain(secret)
        expect(result.stdout).not.toContain('copyId')
        expect(result.stderr).not.toContain('copyId')
        if (json) {
          expect(result.stderr).toBe('')
          const output = JSON.parse(result.stdout)
          expect(output).toMatchObject({
            kind: 'INTERNAL',
            code: 'answer_turn_failed',
            message: 'The answer service returned a malformed stream.',
            detail: {
              code: 'answer_turn_failed',
              detail: 'The answer could not be completed.',
            },
            exitCode: 1,
          })
          expect(output).not.toHaveProperty('events')
          expect(output).not.toHaveProperty('problem.copyId')
        } else {
          expect(result.stdout).toBe('')
          expect(result.stderr).toBe('The answer service returned a malformed stream.\n')
        }
      }
    } finally {
      await server.close()
    }
  }, 30_000)
})
