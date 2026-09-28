import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCallCommand, runProcureCommand } from '../../../tools/ae/commands/call'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { TOOL_MARKET_DESCRIBE_PATH } from '@/modules/common/market-tool-paths'
import { FUNDING_HANDOFF_CREATE_PATH } from '@/modules/money/funding-handoff.actions'
import { CliFailure, callJson, cliFailureToProblem, CLI_REQUEST_TIMEOUT_MS } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}
const toolRef = `operation:v1:${'a'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`
let testConfigDirectory: string

beforeEach(() => {
  testConfigDirectory = mkdtempSync(join(tmpdir(), 'ae-call-test-'))
  vi.stubEnv('AE_CONFIG_DIR', testConfigDirectory)
})

function toolQuote(input: Record<string, unknown> = {}) {
  return {
    kind: 'committed',
    quoteRef,
    toolRef,
    toolVersion: 1,
    expiresAt: 1_900_000_000_000,
    normalizedInput: input,
    price: { currency: 'AUD', units: '0', exponent: 6 },
    account: {
      accountRef: 'account:test',
      available: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    budget: {
      principalRef: 'principal:test',
      maximumPerCall: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    policyRefs: ['commercial-policy:sandbox'],
    evidenceDigest: 'sha256:inspection',
    continuation: {
      action: 'tool.call',
      method: 'POST',
      path: '/api/v1/tools/call',
      input: { quoteRef, idempotencyKey: 'replace-at-call' },
    },
  }
}

function completedCall(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'completed',
    callRef: 'call:one',
    toolRef,
    output: { value: 1 },
    evidenceHash: 'sha256:test',
    usage: {
      usageRef: 'usage:one',
      observedAt: 100,
      chargeState: 'free_tier',
      priceDigest: 'sha256:price',
      amount: { currency: 'USD', units: '0', exponent: 2 },
    },
    ...overrides,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  vi.unstubAllEnvs()
  rmSync(testConfigDirectory, { recursive: true, force: true })
})

function setApiKey(value: string, origin = options.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}

function stalledBody(signal: AbortSignal): Response {
  return new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
    },
  }), { headers: { 'content-type': 'application/json' } })
}
function controlRequestDeadline(): { expire: () => void; restore: () => void } {
  const originalSetTimeout = globalThis.setTimeout
  let expire: (() => void) | undefined
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay !== CLI_REQUEST_TIMEOUT_MS) return originalSetTimeout(callback, delay, ...args)
    expire = () => callback(...args)
    return originalSetTimeout(() => {}, CLI_REQUEST_TIMEOUT_MS)
  })
  return {
    expire: () => {
      if (expire === undefined) throw new Error('request_deadline_not_scheduled')
      expire()
    },
    restore: () => spy.mockRestore(),
  }
}


describe('CLI request deadline', () => {
  it('bounds a server that never sends headers', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        const { promise, reject } = Promise.withResolvers<Response>()
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        return promise
      }))
      const pending = callJson(options.baseUrl, '/api/v1/tools', { method: 'GET' })
      const failure = expect(pending).rejects.toMatchObject({ kind: 'UNAVAILABLE', code: 'request-timeout' })
      await vi.advanceTimersByTimeAsync(CLI_REQUEST_TIMEOUT_MS)
      await failure
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the same deadline after headers while the response body stalls', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_url, init) => {
        const { promise, resolve } = Promise.withResolvers<Response>()
        setTimeout(() => resolve(stalledBody(init!.signal!)), CLI_REQUEST_TIMEOUT_MS / 2)
        return promise
      }))
      const pending = callJson(options.baseUrl, '/api/v1/tools', { method: 'GET' })
      const failure = expect(pending).rejects.toMatchObject({ kind: 'UNAVAILABLE', code: 'request-timeout' })
      await vi.advanceTimersByTimeAsync(CLI_REQUEST_TIMEOUT_MS / 2)
      await vi.advanceTimersByTimeAsync(CLI_REQUEST_TIMEOUT_MS / 2)
      await failure
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('market-terminal authenticated Tool Call', () => {
  it('routes need selection through procure and renders the typed exact continuation', async () => {
    setApiKey('ae-test-key')
    const inputSchema = { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
    const send = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      schemaVersion: 'tool.procure:v1', kind: 'needs_input', status: 'needs_input',
      toolRef, toolName: 'Search', inputJsonSchema: inputSchema, requiredFields: ['query'],
      next: { kind: 'exact', toolRef },
    }))
    vi.stubGlobal('fetch', send)
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await runProcureCommand([], { ...options, json: false, input: JSON.stringify({ kind: 'need', need: 'Search for a dataset' }) })
    const request = send.mock.calls[0]?.[1]
    expect(request?.body).toBe(JSON.stringify({ kind: 'need', need: 'Search for a dataset' }))
    expect(output.mock.calls.map(([part]) => String(part)).join('')).toContain(`\"toolRef\":\"${toolRef}\"`)
    expect(output.mock.calls.map(([part]) => String(part)).join('')).toContain('query')
  })

  it('requires the native buyer connection before quoting', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([toolRef], { ...options, input: '{}' })).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      nextCommand: 'ae connect',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an origin-bound reconnect command for an expired credential without dispatching', async () => {
    setApiKey('ae-expired-key')
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ kind: 'UNAUTHENTICATED' }, { status: 401 }))
    vi.stubGlobal('fetch', send)
    let failure: unknown
    try {
      await runCallCommand([toolRef], { ...options, input: '{}' })
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      code: 'agent_access_key_invalid', nextCommand: 'ae connect --base-url https://market.example --json',
    })
    if (!(failure instanceof CliFailure)) throw new Error('expected_cli_failure')
    expect(cliFailureToProblem(failure, { origin: options.baseUrl }).nextCommand)
      .toBe('ae connect --base-url https://market.example --json')
    expect(send).toHaveBeenCalledOnce()
  })

  it('offers describe when the supplied input is invalid', async () => {
    setApiKey('ae-test-key')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      kind: 'refused', toolRef, code: 'input_invalid', retryable: false, correlationRef: 'correlation:invalid',
      continuation: { action: 'registry.tools.describe', method: 'POST', path: TOOL_MARKET_DESCRIBE_PATH, input: { toolRef } },
    })))
    await expect(runCallCommand([toolRef], { ...options, input: '{}' })).rejects.toMatchObject({
      retryable: false, nextCommand: `ae describe ${toolRef} --base-url https://market.example --json`,
    })
  })

  it('sends a funding refusal to the same fund handoff doctor reports, without placeholder fields', async () => {
    setApiKey('ae-test-caller-key')
    const funding = {
      action: 'funding.handoff.create',
      method: 'POST',
      path: FUNDING_HANDOFF_CREATE_PATH,
      input: {
        principalAmount: { currency: 'AUD', units: '1000000', exponent: 6 },
        idempotencyKey: 'funding:one',
      },
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      kind: 'refused', toolRef, code: 'insufficient_balance', retryable: false,
      correlationRef: 'correlation:funding', continuation: funding,
    })))

    let thrown: unknown
    try {
      await runCallCommand([toolRef], { ...options, baseUrlSource: 'flag', input: '{}' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CliFailure)
    if (!(thrown instanceof CliFailure)) return
    expect(thrown.code).toBe('insufficient_balance')
    expect(thrown.nextCommand).toBe('ae fund --base-url https://market.example --json')
    expect(thrown.suggestion).toBe('Add Account credit as the owner, then repeat this call.')
    expect(thrown.detail).toMatchObject({ continuation: funding })
    expect(JSON.stringify(thrown.detail)).not.toContain('<redacted>')
  })

  it('preserves an actionable caller-specific Tool quote refusal', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      kind: 'refused',
      toolRef,
      code: 'tool_not_ready',
      retryable: true,
      correlationRef: 'correlation:quote',
      continuation: {
        action: 'tool.quote',
        method: 'POST',
        path: '/api/v1/tools/quote',
        input: { toolRef, input: {} },
        retryAfterMs: 5000,
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([toolRef], { ...options, input: '{}' })).rejects.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'tool_not_ready',
      detail: { correlationRef: 'correlation:quote' },
    } satisfies Partial<CliFailure>)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/tools/quote')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
  })

  it('rejects a missing JSON option before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([toolRef], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects extra Call positionals before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([toolRef, '{}', 'extra'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed input before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand([toolRef], { ...options, input: '{' })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-input',
    } satisfies Partial<CliFailure>)
    await expect(runCallCommand([toolRef], { ...options, input: '[]' })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-input',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('projects only Tool input and command identity onto the canonical HTTP service', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writeError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote({ query: 'hello' })))
      .mockResolvedValueOnce(jsonResponse(completedCall()))
    vi.stubGlobal('fetch', fetchMock)

    await runCallCommand(
      [toolRef],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(writeError).not.toHaveBeenCalled()
    const [quoteUrl, quoteInit] = fetchMock.mock.calls[0]!
    expect(quoteUrl).toBe('https://market.example/api/v1/tools/quote')
    expect(JSON.parse(String(quoteInit?.body))).toEqual({ toolRef, input: { query: 'hello' } })
    const [url, init] = fetchMock.mock.calls[1]!
    expect(url).toBe('https://market.example/api/v1/tools/call')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({
      quoteRef,
      idempotencyKey: 'idem-cli-one',
    })
    expect(String(init?.body)).not.toMatch(/endpoint|provider|credential|payment/iu)
    const stdout = write.mock.calls.flat().join('')
    expect(stdout).not.toContain('ae-test-caller-key')
    expect(stdout).not.toContain('idem-cli-one')
  })

  it('reads piped JSON input and sends the same canonical Tool payload', async () => {
    setApiKey('ae-test-caller-key')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote({ query: 'hello from stdin' })))
      .mockResolvedValueOnce(jsonResponse(completedCall({ callRef: 'call:stdin' })))
    vi.stubGlobal('fetch', fetchMock)

    await runCallCommand(
      [toolRef],
      { ...options, input: '-', idempotencyKey: 'idem-cli-stdin' },
      Readable.from(['{"query":"hello from stdin"}']),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      quoteRef,
      idempotencyKey: 'idem-cli-stdin',
    })
  })

  it.each([
    {
      name: 'empty',
      contents: '',
      failure: { kind: 'INVALID_ARGUMENT', code: 'call-usage' },
    },
    {
      name: 'malformed',
      contents: '{',
      failure: { kind: 'INVALID_ARGUMENT', code: 'call-input' },
    },
    {
      name: 'non-object',
      contents: '[]',
      failure: { kind: 'INVALID_ARGUMENT', code: 'call-input' },
    },
    {
      name: 'oversized',
      contents: 'x'.repeat((256 * 1024) + 1),
      failure: { kind: 'PAYLOAD_TOO_LARGE', code: 'payload_too_large' },
    },
  ])('rejects $name piped input before any network request', async ({ contents, failure }) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand(
      [toolRef],
      { ...options, input: '-' },
      Readable.from([contents]),
    )).rejects.toMatchObject(failure)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never prints raw idempotency material in human output', async () => {
    setApiKey('ae-test-caller-key')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'pending',
        callRef: 'call:one',
        toolRef,
        retryAfterMs: 100,
      })))

    await runCallCommand([toolRef], {
      ...options,
      json: false,
      input: '{}',
      idempotencyKey: 'FAKE_IDEMPOTENCY_SENTINEL',
    })

    expect(stdout.mock.calls.flat().join('')).not.toContain('FAKE_IDEMPOTENCY_SENTINEL')
    expect(stderr.mock.calls.flat().join('')).not.toContain('FAKE_IDEMPOTENCY_SENTINEL')
  })

  it('polls a pending Call through the authenticated status route and prints the durable terminal result', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote({ query: 'hello' })))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'pending',
        callRef: 'call:one',
        toolRef,
        retryAfterMs: 100,
      }))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'found',
        callRef: 'call:one',
        version: 1,
        toolRef,
        state: 'terminal',
        evidenceHash: 'sha256:test',
        result: completedCall(),
      }))
    vi.stubGlobal('fetch', fetchMock)

    await runCallCommand(
      [toolRef],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one', wait: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [statusUrl, statusInit] = fetchMock.mock.calls[2]!
    expect(statusUrl).toBe('https://market.example/api/v1/calls/call%3Aone')
    expect(statusInit?.method).toBe('GET')
    expect(new Headers(statusInit?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    const printed = JSON.parse(write.mock.calls.flat().join('')) as { kind?: string; callRef?: string; evidenceHash?: string }
    expect(printed).toMatchObject({
      kind: 'completed',
      callRef: 'call:one',
      evidenceHash: 'sha256:test',
    })
  })

  it('preserves a structured status refusal while waiting instead of relabelling it as transport unknown', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'pending',
        callRef: 'call:one',
        toolRef,
        retryAfterMs: 100,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'about:blank',
        title: 'Unavailable',
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'provider_unavailable',
        detail: 'The provider is unavailable.',
        retryable: true,
      }), { status: 503, headers: { 'content-type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCallCommand(
      [toolRef],
      { ...options, input: '{}', idempotencyKey: 'idem-cli-wait-503', wait: true },
    )).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'provider_unavailable',
      retryable: true,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses the shared insufficient-credit continuation instead of status', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse(completedCall({
        callRef: 'call:credit',
        usage: {
          usageRef: 'usage:credit',
          observedAt: 100,
          chargeState: 'insufficient_credit',
          amount: { currency: 'USD', units: '100', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      }))))

    await runCallCommand([toolRef], {
      ...options,
      input: '{}',
      idempotencyKey: 'idem-credit',
    })

    expect(JSON.parse(write.mock.calls.flat().join(''))).toMatchObject({
      kind: 'completed',
      nextCommand: 'ae account balance --json',
    })
  })

  it('retains the prepared Call on a stalled acknowledgement and refuses a fresh purchase', async () => {
    setApiKey('ae-test-caller-key')
    const deadline = controlRequestDeadline()
    const reachedCall = Promise.withResolvers<void>()
    try {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(toolQuote()))
        .mockImplementationOnce((_url, init) => {
          const response = stalledBody(init!.signal!)
          reachedCall.resolve()
          return Promise.resolve(response)
        })
      vi.stubGlobal('fetch', fetchMock)
      const pending = runCallCommand([toolRef], { ...options, input: '{}', idempotencyKey: 'idem-timeout' })
      await Promise.race([
        reachedCall.promise,
        pending.then(() => { throw new Error('Call completed without reaching the stalled response') }),
      ])
      deadline.expire()
      const failure = await pending.catch((error: unknown) => error)
      if (!(failure instanceof CliFailure)) throw failure
      expect(failure).toMatchObject({ code: 'call-transport-timeout', detail: { identityPreserved: true } })
      const detail = failure.detail
      if (typeof detail !== 'object' || detail === null || !('recoveryRef' in detail) || typeof detail.recoveryRef !== 'string') {
        throw new Error('prepared Call must retain a recovery reference')
      }
      const recoveryRef = detail.recoveryRef
      expect(recoveryRef).toEqual(expect.any(String))
      expect(failure.nextCommand).toBe(`ae call resume ${recoveryRef} --base-url ${options.baseUrl} --json`)
      await expect(runCallCommand([toolRef], { ...options, input: '{}' })).rejects.toMatchObject({
        code: 'call-recovery-required', detail: { recoveryRef },
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      deadline.restore()
    }
  })

  it('offers exact Call status after an acknowledged Call stalls while polling', async () => {
    setApiKey('ae-test-caller-key')
    const deadline = controlRequestDeadline()
    const reachedStatus = Promise.withResolvers<void>()
    try {
      const callRef = `operation-invocation:v1:${'c'.repeat(64)}`
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(toolQuote()))
        .mockResolvedValueOnce(jsonResponse({ kind: 'pending', toolRef, callRef, retryAfterMs: 100 }))
        .mockImplementationOnce((_url, init) => {
          const response = stalledBody(init!.signal!)
          reachedStatus.resolve()
          return Promise.resolve(response)
        })
      vi.stubGlobal('fetch', fetchMock)
      const pending = runCallCommand([toolRef], { ...options, input: '{}', wait: true })
      await Promise.race([
        reachedStatus.promise,
        pending.then(() => { throw new Error('Call completed without reaching the stalled status') }),
      ])
      deadline.expire()
      const failure = await pending.catch((error: unknown) => error)
      expect(failure).toMatchObject({
        code: 'call-transport-timeout', detail: { callRef, identityPreserved: true },
        nextCommand: `ae status ${callRef} --base-url ${options.baseUrl} --json`,
      })
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls[2]?.[0]).toBe(`${options.baseUrl}/api/v1/calls/${encodeURIComponent(callRef)}`)
    } finally {
      deadline.restore()
    }
  })
})
