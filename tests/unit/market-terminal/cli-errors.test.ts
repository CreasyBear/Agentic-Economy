import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ANSWER_TURN_DATA_PART,
  type AnswerEvent,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'

import { runAskCommand } from '../../../tools/ae/commands/ask'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure, requireOk, type HttpOutcome } from '../../../tools/ae/lib/output'

function answerTurnResponse(frames: readonly AnswerTurnFrame[]): Response {
  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: ({ writer }) => {
      for (const frame of frames) {
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
      }
    },
    onError: () => 'answer_turn_failed',
  })
  return createUIMessageStreamResponse({ stream })
}

function rawAnswerEvent(type: string, fields: Record<string, unknown>): AnswerEvent {
  return { type, ...fields } as unknown as AnswerEvent
}

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return {
    read: () => writes.join(''),
    restore: () => spy.mockRestore(),
  }
}
async function startAnswerServer(frames: readonly AnswerTurnFrame[]): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const body = await answerTurnResponse(frames).text()
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    throw new Error('answer test server did not expose a TCP address')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    }),
  }
}
async function spawnCli(args: readonly string[]): Promise<{
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    status: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
  }>()
  const child = spawn(process.execPath, ['--import', 'tsx', 'tools/ae/cli.ts', ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.once('error', reject)
  child.once('close', (status, signal) => resolve({
    status,
    signal,
    stdout: Buffer.concat(stdout).toString('utf8'),
    stderr: Buffer.concat(stderr).toString('utf8'),
  }))
  return promise
}




describe('market-terminal CLI error contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prints a canonical JSON envelope for parse failures without a stack', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'feeds',
      '--json',
      '--unknown-option',
    ], { cwd: process.cwd(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')

    const envelope = JSON.parse(result.stdout)
    expect(envelope).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid-arguments',
      message: expect.stringContaining('--unknown-option'),
      exitCode: 1,
    })
    expect(envelope).not.toHaveProperty('stack')
  }, 15_000)

  it('prints only JSON when a write action lacks --allow-write', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'action',
      'customerRequest.confirm',
      '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'PERMISSION_DENIED',
      code: 'write_requires_allow',
      exitCode: 1,
    })
  }, 15_000)

  it('redacts malformed action JSON in both human and JSON output', () => {
    const rawInput = '{"apiKey":"TOPSECRET",}'
    for (const json of [false, true]) {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        'tools/ae/cli.ts',
        'action',
        'registry.list',
        rawInput,
        ...(json ? ['--json'] : []),
      ], { cwd: process.cwd(), encoding: 'utf8' })

      expect(result.status).toBe(1)
      expect(result.signal).toBeNull()
      expect(result.stdout).not.toContain(rawInput)
      expect(result.stdout).not.toContain('TOPSECRET')
      expect(result.stderr).not.toContain(rawInput)
      expect(result.stderr).not.toContain('TOPSECRET')
      if (json) {
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toMatchObject({
          kind: 'INVALID_ARGUMENT',
          code: 'action-input',
          message: 'Input must be valid JSON.',
          exitCode: 1,
        })
      } else {
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('Input must be valid JSON.\n')
      }
    }
  }, 15_000)
  it('preserves typed missing-source failures for feed commands', () => {
    const env = { ...process.env, CONVEX_URL: '', VITE_CONVEX_URL: '', VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: '' }
    const commands = [
      ['feeds', '--json'],
      ['manifest', '--json'],
      ['run', `operation:v1:${'0'.repeat(64)}`, '--json'],
    ]
    for (const command of commands) {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        'tools/ae/cli.ts',
        ...command,
      ], { cwd: process.cwd(), env, encoding: 'utf8' })

      expect(result.status).toBe(1)
      expect(result.signal).toBeNull()
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'missing_convex_url',
        message: expect.stringContaining('CONVEX_URL'),
        exitCode: 1,
      })
      expect(result.stdout).not.toContain('Command failed.')
    }
  }, 30_000)
  it('loads one file-backed environment for doctor and market-terminal commands', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ae-cli-env-'))
    const cliPath = resolve('tools/ae/cli.ts')
    const tsxLoader = resolve('node_modules/tsx/dist/loader.mjs')
    const tsconfigPath = resolve('tsconfig.json')
    writeFileSync(join(cwd, '.env.development'), 'VITE_CONVEX_URL=http://127.0.0.1:1\n')
    const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: tsconfigPath }
    delete env.CONVEX_URL
    delete env.VITE_CONVEX_URL
    delete env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      const doctor = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, 'doctor', '--json'], {
        cwd,
        env,
        encoding: 'utf8',
      })
      expect(doctor.status).toBe(0)
      expect(JSON.parse(doctor.stdout).core).toEqual(expect.arrayContaining([
        { name: 'VITE_CONVEX_URL', status: 'configured' },
      ]))

      for (const args of [
        ['feeds', '--json'],
        ['manifest', '--json'],
        ['run', `operation:v1:${'0'.repeat(64)}`, '--json'],
      ]) {
        const result = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, ...args], {
          cwd,
          env,
          encoding: 'utf8',
        })
        expect(result.status).toBe(1)
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).not.toMatchObject({ code: 'missing_convex_url' })
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 30_000)

  it('rejects invalid search modes locally with accepted values and retry guidance', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      '--base-url',
      'http://127.0.0.1:1',
      'search',
      'dentist',
      '--mode',
      'nowhere',
    ], { cwd: process.cwd(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Invalid --mode: nowhere')
    expect(result.stderr).toContain('near_me')
    expect(result.stderr).toContain('whole_catalogue')
    expect(result.stderr).toContain('Retry with --mode')
  }, 15_000)

  it('keeps failed human actions off stdout while preserving stderr diagnostics', () => {
    const env = {
      ...process.env,
      CONVEX_URL: '',
      VITE_CONVEX_URL: '',
      VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: '',
      NODE_ENV: 'development',
    }
    for (const args of [
      ['action', 'registry.list', '{"limit":1}'],
      ['action', 'customerRequest.confirm'],
    ]) {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        'tools/ae/cli.ts',
        ...args,
      ], { cwd: process.cwd(), env, encoding: 'utf8' })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stdout).not.toContain('Running ')
      expect(result.stdout).not.toContain('authority:')
      expect(result.stderr.length).toBeGreaterThan(0)
    }
  }, 30_000)

  it('prints a terminal Ran line only after a human action succeeds', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ae-cli-success-'))
    const cliPath = resolve('tools/ae/cli.ts')
    const tsconfigPath = resolve('tsconfig.json')
    const tsxLoader = resolve('node_modules/tsx/dist/loader.mjs')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: 'true',
      NODE_ENV: 'development',
      TSX_TSCONFIG_PATH: tsconfigPath,
    }
    delete env.CONVEX_URL
    delete env.VITE_CONVEX_URL

    try {
      const result = spawnSync(process.execPath, [
        '--import',
        tsxLoader,
        cliPath,
        'action',
        'registry.list',
        '{}',
      ], {
        cwd,
        env,
        encoding: 'utf8',
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('Ran registry.list')
      expect(result.stdout).not.toContain('Running registry.list')
      expect(result.stdout).not.toContain('authority:')
      expect(result.stdout).toContain('result.kind =')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 15_000)


  it('rejects an invalid base URL as a canonical JSON argument error', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      '--base-url',
      'not-a-url',
      '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')

    const envelope = JSON.parse(result.stdout)
    expect(envelope).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid-arguments',
      message: 'Invalid --base-url: not-a-url',
      exitCode: 1,
    })
    expect(envelope).not.toHaveProperty('stack')
  }, 15_000)

  it('falls back to the status kind for a malformed remote problem kind', () => {
    const body = {
      type: 'https://agentic-economy.invalid/problems/auth-required',
      title: 'Unauthenticated',
      status: 401,
      kind: 'not-a-problem-kind',
      code: 'remote_auth_required',
      detail: 'Authentication\nrequired.',
    }
    const outcome: HttpOutcome = {
      status: 401,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/problem+json' }),
      body,
      bodyText: JSON.stringify(body),
    }

    let thrown: unknown
    try {
      requireOk(outcome, '/api/example')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('UNAUTHENTICATED')
    expect(thrown.code).toBe('remote_auth_required')
    expect(thrown.message).toBe('/api/example returned 401: Authentication required.')
    expect(thrown.detail).toBe('Authentication\nrequired.')
  })

  it('does not accept no_data as a non-2xx problem kind', () => {
    const body = {
      type: 'https://agentic-economy.invalid/problems/no-data',
      title: 'No data',
      status: 401,
      kind: 'no_data',
      code: 'remote_no_data',
      detail: 'No data available.',
    }
    const outcome: HttpOutcome = {
      status: 401,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/problem+json' }),
      body,
      bodyText: JSON.stringify(body),
    }

    let thrown: unknown
    try {
      requireOk(outcome, '/api/example')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.kind).toBe('UNAUTHENTICATED')
  })

  it('uses the title when remote detail is not a string', () => {
    const body = {
      type: 'https://agentic-economy.invalid/problems/auth-required',
      title: 'Unauthenticated',
      status: 401,
      kind: 'not-a-problem-kind',
      code: 'remote_auth_required',
      detail: { reason: 'Authentication required.' },
    }
    const outcome: HttpOutcome = {
      status: 401,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/problem+json' }),
      body,
      bodyText: JSON.stringify(body),
    }

    let thrown: unknown
    try {
      requireOk(outcome, '/api/example')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.detail).toBeUndefined()
    expect(thrown.message).toBe('/api/example returned 401: Unauthenticated')
  })

  it('projects an ask problem response into a typed safe failure without raw JSON', async () => {
    const problem = {
      type: 'https://agentic-economy.invalid/problems/auth-required',
      title: 'Unauthenticated',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'missing_auth',
      detail: 'Authentication required with secret=do-not-leak.',
      copyId: 'private-copy-id',
    }
    const rawBody = JSON.stringify(problem)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-AE-Turn-Key')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      return new Response(rawBody, {
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
    expect(thrown.detail).toMatchObject({ code: 'missing_auth', detail: 'An owner session is required for this answer request.' })
    expect(JSON.stringify(thrown.detail)).not.toContain('secret=do-not-leak')
    expect(JSON.stringify(thrown.detail)).not.toContain('copyId')
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
