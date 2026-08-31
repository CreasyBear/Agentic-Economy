import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { isLoopbackCliBaseUrl, parseArgs } from '../../../tools/ae/lib/args'
import { CliFailure, callJson, requireOk, type HttpOutcome } from '../../../tools/ae/lib/output'
import { spawnCli, spawnCliSync } from './cli-errors-harness'

describe('market-terminal CLI error contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['http://localhost:3024', true],
    ['http://127.0.0.1:3024', true],
    ['http://127.255.1.2:3024', true],
    ['http://[::1]:3024', true],
    ['https://127.example.invalid', false],
    ['https://agentic-economy-phi.vercel.app', false],
  ] as const)('classifies CLI origin %s as loopback=%s', (origin, expected) => {
    expect(isLoopbackCliBaseUrl(origin)).toBe(expected)
  })

  it('routes root call through the call runner before network access', async () => {
    const result = await spawnCli(['call', '--json'])

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
    })
  }, 15_000)

  it('requires a reachable market when browsing without a job query', () => {
    const result = spawnCliSync([
      '--base-url',
      'http://127.0.0.1:1',
      'search',
    ])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Could not reach http://127.0.0.1:1.')
  }, 15_000)

  it('rejects an invalid base URL as a canonical JSON argument error', () => {
    const result = spawnCliSync(['--base-url', 'not-a-url', '--json'])

    expect(result.status).toBe(1)
    expect(result.signal).toBeNull()
    expect(result.stderr).toBe('')

    const envelope = JSON.parse(result.stdout)
    expect(envelope).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid-arguments',
      message: 'Invalid --base-url. Use an origin-only HTTP(S) URL.',
      exitCode: 1,
    })
    expect(envelope).not.toHaveProperty('stack')
  }, 15_000)

  it('targets local Vite when Convex is loopback and no CLI origin is set', () => {
    const previousConvex = process.env.CONVEX_URL
    const previousPublicConvex = process.env.VITE_CONVEX_URL
    const previousCli = process.env.AE_CLI_BASE_URL
    const previousCanonical = process.env.AE_CANONICAL_BASE_URL
    process.env.CONVEX_URL = 'http://127.0.0.1:3210'
    delete process.env.VITE_CONVEX_URL
    delete process.env.AE_CLI_BASE_URL
    delete process.env.AE_CANONICAL_BASE_URL
    try {
      expect(parseArgs(['search', 'rates']).options.baseUrl).toBe('http://127.0.0.1:3024')
    } finally {
      if (previousConvex === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvex
      if (previousPublicConvex === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousPublicConvex
      if (previousCli === undefined) delete process.env.AE_CLI_BASE_URL
      else process.env.AE_CLI_BASE_URL = previousCli
      if (previousCanonical === undefined) delete process.env.AE_CANONICAL_BASE_URL
      else process.env.AE_CANONICAL_BASE_URL = previousCanonical
    }
  })

  it.each([
    'https://user:TOPSECRET@market.example',
    'https://market.example/path/TOPSECRET',
    'https://market.example/?q=TOPSECRET',
    'https://market.example/#TOPSECRET',
  ])('does not echo secrets from invalid base URL %s in human or JSON errors', (baseUrl) => {
    for (const json of [false, true]) {
      const result = spawnCliSync([
        '--base-url',
        baseUrl,
        ...(json ? ['--json'] : []),
      ])

      expect(result.status).toBe(1)
      expect(result.stdout).not.toContain('TOPSECRET')
      expect(result.stderr).not.toContain('TOPSECRET')
      if (json) {
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toMatchObject({
          kind: 'INVALID_ARGUMENT',
          code: 'invalid-arguments',
          exitCode: 1,
          nextCommand: 'ae help',
        })
      }
    }
  }, 30_000)

  it('keeps loopback connection-refused diagnostics local and redacted', () => {
    const hostedDoctor = 'ae doctor --base-url https://agentic-economy-phi.vercel.app'
    for (const json of [false, true]) {
      const result = spawnCliSync([
        '--base-url',
        'http://127.0.0.1:1',
        'search',
        'TOPSECRET',
        ...(json ? ['--json'] : []),
      ])

      expect(result.status).toBe(1)
      expect(result.stdout).not.toContain('TOPSECRET')
      expect(result.stderr).not.toContain('TOPSECRET')
      if (json) {
        expect(result.stderr).toBe('')
        expect(JSON.parse(result.stdout)).toMatchObject({
          kind: 'UNAVAILABLE',
          code: 'connection_refused',
          message: 'Could not reach http://127.0.0.1:1.',
          suggestion: 'Local AE is not running; check the hosted AE service instead.',
          nextCommand: hostedDoctor,
          exitCode: 1,
        })
        expect(result.stdout).not.toContain('npm run')
      } else {
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe([
          'Could not reach http://127.0.0.1:1.',
          'Local AE is not running; check the hosted AE service instead.',
          `Next: ${hostedDoctor}`,
          '',
        ].join('\n'))
        expect(result.stderr).not.toContain('npm run')
      }
    }
  }, 30_000)

  it('keeps remote connection-refused diagnostics origin-aware, non-looping, and redacted', () => {
    const origin = 'https://ae-unreachable.invalid'
    const expectedNextCommand = `ae config --base-url ${origin} --json`
    for (const json of [false, true]) {
      const result = spawnCliSync([
        '--base-url',
        origin,
        'search',
        'TOPSECRET?private=query',
        ...(json ? ['--json'] : []),
      ])

      expect(result.status).toBe(1)
      expect(result.stdout).not.toContain('TOPSECRET')
      expect(result.stderr).not.toContain('TOPSECRET')
      expect(result.stdout).not.toContain('private=query')
      expect(result.stderr).not.toContain('private=query')
      if (json) {
        expect(result.stderr).toBe('')
        const envelope = JSON.parse(result.stdout) as { nextCommand: string }
        expect(envelope).toMatchObject({
          kind: 'UNAVAILABLE',
          code: 'connection_refused',
          message: `Could not reach ${origin}.`,
          suggestion: 'Check network access and confirm the configured AE origin.',
          nextCommand: expectedNextCommand,
          exitCode: 1,
        })
        expect(result.stdout).not.toContain('npm run')

        const [executable, ...continuationArgs] = envelope.nextCommand.split(' ')
        expect(executable).toBe('ae')
        const continuationEnv: NodeJS.ProcessEnv = {
          ...process.env,
          AE_CONFIG_DIR: join(tmpdir(), `ae-cli-origin-continuation-${process.pid}`),
        }
        delete continuationEnv.AE_API_KEY
        delete continuationEnv.AE_API_KEY_ORIGIN
        delete continuationEnv.AE_CLI_BASE_URL
        delete continuationEnv.AE_CANONICAL_BASE_URL
        const continuation = spawnCliSync(continuationArgs, { env: continuationEnv })
        expect(continuation.status).toBe(0)
        expect(continuation.stderr).toBe('')
        expect(continuation.stdout).not.toContain('TOPSECRET')
        expect(continuation.stdout).not.toContain('private=query')
        expect(JSON.parse(continuation.stdout)).toMatchObject({
          kind: 'config',
          baseUrl: { origin, source: 'flag' },
        })
      } else {
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe([
          `Could not reach ${origin}.`,
          'Check network access and confirm the configured AE origin.',
          `Next: ${expectedNextCommand}`,
          '',
        ].join('\n'))
        expect(result.stderr).not.toContain('npm run')
      }
    }
  }, 30_000)

  it('routes unavailable public reads to same-origin health without echoing the query', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/problem+json' })
      response.end(JSON.stringify({
        type: 'about:blank',
        title: 'Unavailable',
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'operation_read_unavailable',
        retryable: true,
      }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('cli_read_test_server_missing')
    const origin = `http://127.0.0.1:${address.port}`
    const privateQuery = 'TOPSECRET private lookup'

    try {
      const result = await spawnCli([
        'search',
        privateQuery,
        '--base-url',
        origin,
        '--json',
      ])

      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(result.stdout).not.toContain(privateQuery)
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: 'UNAVAILABLE',
        code: 'operation_read_unavailable',
        retryable: true,
        suggestion: 'Check AE service health before retrying this read.',
        nextCommand: `ae doctor --base-url ${origin} --json`,
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
    }
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
    expect(thrown.message).toBe('/api/example returned 401: Unauthenticated')
    expect(thrown.detail).toBeUndefined()
    expect(JSON.stringify(thrown)).not.toContain('Authentication')
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

  it('titles the failure from the canonical kind, not from remote prose', () => {
    const body = {
      type: 'https://agentic-economy.invalid/problems/auth-required',
      title: 'Remote deployment prose',
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
    expect(thrown.message).not.toContain('Remote deployment prose')
  })

  it.each([
    [404, 'NOT_FOUND', 'Not found'],
    [401, 'UNAUTHENTICATED', 'Unauthenticated'],
    [500, 'INTERNAL', 'Internal error'],
  ] as const)('projects an application/json problem body for %s with its status kind', (status, kind, title) => {
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
    expect(thrown.detail).toBeUndefined()
    expect(thrown.message).toBe(`/api/example returned ${status}: ${title}`)
    expect(thrown.message).not.toContain(body.detail)
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

  it('keeps stable retry signals from an RFC9457 problem and drops remote prose fields', () => {
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
      expect(error.kind).toBe('UNAVAILABLE')
      expect(error.code).toBe('provider_unavailable')
      expect(error.retryable).toBe(true)
      expect(error.retryAfter).toBe('7')
      expect(error.message).toBe('/api/example returned 503: Unavailable')
      expect(error).not.toHaveProperty('recovery')
      expect(error).not.toHaveProperty('nextAction')
      expect(JSON.stringify(error)).not.toContain('invocation:one')
    }
  })

  it('does not follow redirects or forward credentials to a second request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/collect' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await callJson('https://market.example', '/api/v1/operations/call', {
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

  it('never copies arbitrary remote problem prose that misses secret-pattern redaction', () => {
    const sentinel = 'backend detail FAKE_SENTINEL_PROBLEM_DETAIL_CURRENT_dd47'
    const body = {
      type: 'about:blank',
      title: `remote title ${sentinel}`,
      status: 502,
      kind: 'INTERNAL',
      code: 'proxy_failure',
      detail: sentinel,
    }
    const outcome: HttpOutcome = {
      status: 502,
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
    expect(thrown.message).toBe('/api/example returned 502: Internal error')
    expect(thrown.detail).toBeUndefined()
    expect(thrown.message).not.toContain(sentinel)
    expect(JSON.stringify(thrown)).not.toContain(sentinel)
  })
})
