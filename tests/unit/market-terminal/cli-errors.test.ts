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

import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'

import { runActionCommand } from '../../../tools/ae/commands/actions'
import { runAskCommand } from '../../../tools/ae/commands/ask'
import { parseArgs, type CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure, callJson, requireOk, type HttpOutcome } from '../../../tools/ae/lib/output'
import { createLocalE2eRegistrySourcePort } from '../../helpers/registry-local-e2e'

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
  it('keeps secondary commands behind explicit demand and advanced namespaces', () => {
    const help = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'help',
      '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    expect(help.status).toBe(0)
    expect(help.stderr).toBe('')
    const helpBody = JSON.parse(help.stdout) as {
      commands: Record<string, unknown>
      auth: {
        authenticatedOperations: Record<string, string>
        cancelRequirements: string
      }
    }
    const commands = helpBody.commands
    expect(Object.keys(commands)).toEqual([
      'manifest',
      'search',
      'inspect',
      'compare',
      'connect',
      'invoke',
      'status',
      'recover',
      'demand',
      'advanced',
    ])
    expect(Object.keys(helpBody.auth.authenticatedOperations)).toEqual([
      'invoke',
      'status',
      'cancel',
      'reconcile',
    ])
    expect(helpBody.auth.authenticatedOperations.cancel).toContain('advanced cancel')
    expect(helpBody.auth.authenticatedOperations.reconcile).toContain(' recover ')
    expect(helpBody.auth.cancelRequirements).toContain('AE_API_KEY')
    expect(helpBody.auth.cancelRequirements).toContain('--idempotency-key')
    expect(helpBody.auth.cancelRequirements).toContain('body.idempotencyKey')
    for (const legacy of ['feeds', 'run', 'study', 'cancel', 'reconcile', 'action', 'doctor', 'business']) {
      expect(commands).not.toHaveProperty(legacy)
    }

    const textHelp = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'help',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    expect(textHelp.status).toBe(0)
    expect(textHelp.stderr).toBe('')
    expect(textHelp.stdout).toContain('Authenticated Operation actions:')
    expect(textHelp.stdout).toContain('invoke:')
    expect(textHelp.stdout).toContain('status:')
    expect(textHelp.stdout).toContain('cancel:')
    expect(textHelp.stdout).toContain('reconcile:')
    expect(textHelp.stdout).toContain('AE_API_KEY')
    expect(textHelp.stdout).toContain('--idempotency-key')

    const unknown = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'feeds',
      '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    expect(unknown.status).toBe(1)
    expect(unknown.stderr).toBe('')
    expect(JSON.parse(unknown.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'unknown-command',
      exitCode: 1,
    })
  }, 30_000)
  afterEach(() => vi.unstubAllGlobals())

  it('prints a canonical JSON envelope for parse failures without a stack', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'manifest',
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
      'advanced',
      'action',
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
        'advanced',
        'action',
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
  it('preserves typed missing-source failures for advanced policy', () => {
    const env = { ...process.env, CONVEX_URL: '', VITE_CONVEX_URL: '', VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: '' }
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'advanced',
      'policy',
      '--json',
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
  }, 30_000)
  it('loads one file-backed environment for doctor and manifest', () => {
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
      const doctor = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, 'advanced', 'doctor', '--json'], {
        cwd,
        env,
        encoding: 'utf8',
      })
      expect(doctor.status).toBe(0)
      expect(JSON.parse(doctor.stdout).core).toEqual(expect.arrayContaining([
        { name: 'VITE_CONVEX_URL', status: 'configured' },
      ]))

      const manifest = spawnSync(process.execPath, ['--import', tsxLoader, cliPath, 'manifest', '--json'], {
        cwd,
        env,
        encoding: 'utf8',
      })
      expect(manifest.status).toBe(0)
      expect(JSON.parse(manifest.stdout)).toMatchObject({
        protocol: 'agentic-economy.operation-terminal.v1',
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 30_000)

  it('requires a Market Operation job query before network work', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      '--base-url',
      'http://127.0.0.1:1',
      'search',
    ], { cwd: process.cwd(), encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Usage: npm run -s ae -- search "<job>"')
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
      ['advanced', 'action', 'registry.list', '{"limit":1}'],
      ['advanced', 'action', 'customerRequest.confirm'],
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
    }
  }, 30_000)

  it('prints a terminal Ran line only after a human action succeeds', async () => {
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())
    const output = captureStdout()
    try {
      await runActionCommand(['registry.list', '{}'], {
        baseUrl: 'http://127.0.0.1:3000',
        json: false,
        help: false,
        allowWrite: false,
        apply: false,
      })
    } finally {
      output.restore()
      restoreRegistry()
    }

    const stdout = output.read()
    expect(stdout).toContain('Ran registry.list')
    expect(stdout).not.toContain('Running registry.list')
    expect(stdout).not.toContain('authority:')
    expect(stdout).toContain('result.kind =')
  })


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
  it.each([
    [404, 'NOT_FOUND'],
    [401, 'UNAUTHENTICATED'],
    [500, 'INTERNAL'],
  ] as const)('projects an application/json problem body for %s with its status kind', (status, kind) => {
    const body = {
      type: 'about:blank',
      title: 'Remote failure',
      status,
      code: 'proxy_failure',
      detail: `The proxy returned ${status}.`,
    }
    const outcome: HttpOutcome = {
      status,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
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
    expect(thrown.kind).toBe(kind)
    expect(thrown.code).toBe('proxy_failure')
    expect(thrown.detail).toBe(body.detail)
    expect(thrown.message).toBe(`/api/example returned ${status}: ${body.detail}`)
  })

  it('treats a legacy error/code JSON envelope as noncanonical', () => {
    const body = { error: `legacy gateway message ${'x'.repeat(2_500)}`, code: 'legacy_failure', secret: 'do-not-print' }
    const outcome: HttpOutcome = {
      status: 500,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/json' }),
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
    expect(thrown.kind).toBe('INTERNAL')
    expect(thrown.code).toBeUndefined()
    expect(thrown.detail).toBeUndefined()
    expect(thrown.message).toBe('/api/example returned 500')
    expect(thrown.message).not.toContain(body.secret)
  })
  it('preserves retry and recovery fields from an RFC9457 problem', () => {
    const body = {
      type: 'about:blank',
      title: 'Unavailable',
      status: 503,
      kind: 'UNAVAILABLE',
      code: 'provider_unavailable',
      detail: 'The provider is unavailable.',
      retryable: true,
      recovery: { invocationRef: 'invocation:one', idempotencyKey: 'idem:one' },
      nextAction: 'Read invocation status before retrying.',
    }
    const outcome: HttpOutcome = {
      status: 503,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/problem+json', 'retry-after': '7' }),
      body,
      bodyText: JSON.stringify(body),
    }

    expect(() => requireOk(outcome, '/api/example')).toThrow(CliFailure)
    try {
      requireOk(outcome, '/api/example')
    } catch (error) {
      if (!(error instanceof CliFailure)) return
      expect(error.retryable).toBe(true)
      expect(error.retryAfter).toBe('7')
      expect(error.recovery).toEqual(body.recovery)
      expect(error.nextAction).toBe(body.nextAction)
    }
  })

  it('does not follow redirects or forward credentials to a second request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/collect' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await callJson('https://market.example', '/api/v1/operations/execute', {
      method: 'POST',
      headers: { Authorization: 'Bearer ae-secret' },
      body: '{}',
    })

    expect(outcome.status).toBe(302)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer ae-secret')
  })

  it('keeps non-structured JSON failures generic', () => {
    const body = { html: '<html>secret stack and credentials</html>' }
    const outcome: HttpOutcome = {
      status: 502,
      ok: false,
      durationMs: 1,
      headers: new Headers({ 'content-type': 'application/json' }),
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
    expect(thrown.message).toBe('/api/example returned 502')
    expect(thrown.detail).toBeUndefined()
    expect(thrown.message).not.toContain('credentials')
  })


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

  it('rejects repeated scalar long options instead of silently choosing the last value', () => {
    for (const args of [
      ['--base-url', 'http://127.0.0.1:3000', '--base-url', 'http://127.0.0.1:3001', '--json'],
      ['--idempotency-key', 'first', '--idempotency-key', 'second', '--json'],
    ]) {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        'tools/ae/cli.ts',
        ...args,
      ], { cwd: process.cwd(), encoding: 'utf8' })

      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code: 'invalid-arguments',
        message: expect.stringContaining('cannot be repeated'),
        exitCode: 1,
      })
    }
  }, 15_000)

  it('keeps --turn-id repeatable at the parser boundary', () => {
    const parsed = parseArgs([
      '--base-url',
      'http://127.0.0.1:3000',
      'advanced',
      'eval',
      'export',
      '--turn-id',
      'turn:first',
      '--turn-id',
      'turn:second',
    ])

    expect(parsed.options.turnIds).toEqual(['turn:first', 'turn:second'])
  })

  it('emits one machine-readable JSON help envelope and keeps root text help usable', () => {
    for (const [args, command] of [
      [['--json', '--help'], 'root'],
      [['connect', '--json', '--help'], 'connect'],
    ] as const) {
      const result = spawnSync(process.execPath, [
        '--import',
        'tsx',
        'tools/ae/cli.ts',
        ...args,
      ], { cwd: process.cwd(), encoding: 'utf8' })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      const envelope = JSON.parse(result.stdout)
      expect(envelope).toMatchObject({
        kind: 'HELP',
        command,
        usage: expect.any(String),
        flags: expect.any(Object),
        auth: {
          credential: 'AE_API_KEY',
          credentialOrigin: 'AE_API_KEY_ORIGIN',
          scope: 'market_operations:invoke',
        },
      })
      if (command === 'connect') {
        expect(envelope.auth.guidance).toEqual(expect.arrayContaining([
          expect.stringContaining('verification URI'),
          expect.stringContaining('AE_API_KEY_ORIGIN'),
        ]))
        expect(JSON.stringify(envelope)).not.toContain('/oauth/grant')
      } else {
        expect(envelope.commands).toEqual(expect.objectContaining({
          connect: expect.objectContaining({ usage: expect.stringContaining('connect') }),
        }))
      }
    }

    const textHelp = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      '--help',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    expect(textHelp.status).toBe(0)
    expect(textHelp.stdout).toContain('AE CLI')
    expect(textHelp.stdout).toContain('Usage:')
    expect(textHelp.stderr).toBe('')
    const connectTextHelp = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/ae/cli.ts',
      'connect',
      '--help',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    expect(connectTextHelp.status).toBe(0)
    expect(connectTextHelp.stdout).toContain('AE_API_KEY_ORIGIN')
    expect(connectTextHelp.stdout).toContain('market_operations:invoke')
    expect(connectTextHelp.stdout).toContain('verification URI')
    expect(connectTextHelp.stderr).toBe('')

  }, 30_000)

})
