import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCallCommand, runProcureCommand, runQuoteCommand } from '../../../tools/ae/commands/call'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { callResultSchema, projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
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

function toolQuote(_input: Record<string, unknown> = {}) {
  return {
    kind: 'committed',
    quoteRef,
    toolRef,
    toolVersion: 1,
    expiresAt: 1_900_000_000_000,

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
      args: { quoteRef, idempotencyKey: 'replace-at-call' },
    },
  }
}

function completedCall(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'completed',
    callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
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
  const owner = callResultSchema.safeParse(body)
  return new Response(JSON.stringify(owner.success ? projectCallMachineResult(owner.data) : body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
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
function controlRequestDeadline(timeoutMs = CLI_REQUEST_TIMEOUT_MS): { expire: () => void; restore: () => void } {
  const originalSetTimeout = globalThis.setTimeout
  let expire: (() => void) | undefined
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay !== timeoutMs) return originalSetTimeout(callback, delay, ...args)
    expire = () => callback(...args)
    return originalSetTimeout(() => {}, timeoutMs)
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
  it('receives a first-use Quote after ledger preparation exceeds the ordinary read deadline', async () => {
    setApiKey('ae-test-key')
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.useFakeTimers()
    try {
      const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        setTimeout(() => resolve(jsonResponse(toolQuote({ network: 'ethereum' }))), 20_000)
      }))
      vi.stubGlobal('fetch', send)
      const result = runQuoteCommand([toolRef], { ...options, input: '{"network":"ethereum"}' })
        .then(() => ({ kind: 'received' }), error => ({ kind: 'failed', error }))
      await vi.advanceTimersByTimeAsync(20_000)
      expect(await result).toEqual({ kind: 'received' })
      expect(JSON.parse(output.mock.calls.flat().join(''))).toMatchObject({ kind: 'committed', quoteRef })
      expect(send).toHaveBeenCalledOnce()
      expect(send.mock.calls[0]?.[0]).toBe(`${options.baseUrl}/api/v1/tools/quote`)
    } finally {
      vi.useRealTimers()
    }
  })

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

  it('bounds a stalled Quote body at 60 seconds without making a Call', async () => {
    setApiKey('ae-test-key')
    vi.useFakeTimers()
    try {
      const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise(resolve => {
        setTimeout(() => resolve(stalledBody(init!.signal!)), 30_000)
      }))
      vi.stubGlobal('fetch', send)
      const pending = runQuoteCommand([toolRef], { ...options, input: '{}' })
      const failure = expect(pending).rejects.toMatchObject({ code: 'request-timeout', message: 'The request timed out after 60000ms.' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(30_000)
      await failure
      expect(send).toHaveBeenCalledOnce()
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
      toolRef, toolName: 'Search', reasons: ['Matches dataset search', 'Accepts text query'],
      alternates: [{ toolRef: `operation:v1:${'c'.repeat(64)}`, title: 'Archive Search', reasons: ['Related data'] }],
      inputJsonSchema: inputSchema, requiredFields: ['query'],
      next: { action: 'tool.procure', args: { kind: 'exact', toolRef }, requiredInput: ['input', 'maxSpendAud', 'idempotencyKey'], authority: 'agent_key' },
    }))
    vi.stubGlobal('fetch', send)
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await runProcureCommand([], { ...options, json: false, input: JSON.stringify({ kind: 'need', need: 'Search for a dataset' }) })
    const request = send.mock.calls[0]?.[1]
    expect(request?.body).toBe(JSON.stringify({ kind: 'need', need: 'Search for a dataset' }))
    expect(output.mock.calls.map(([part]) => String(part)).join('')).toContain(`"toolRef":"${toolRef}"`)
    expect(output.mock.calls.map(([part]) => String(part)).join('')).toContain('query')
    const humanOutput = output.mock.calls.map(([part]) => String(part)).join('')
    expect(humanOutput).toContain('Selected Search · Matches dataset search · Accepts text query')
    expect(humanOutput).toContain('Alternates:')
    expect(humanOutput).toContain('- Archive Search (Related data)')
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
      continuation: { action: 'registry.tools.describe', args: { toolRef } },
    })))
    await expect(runCallCommand([toolRef], { ...options, input: '{}' })).rejects.toMatchObject({
      retryable: false, nextCommand: `ae describe ${toolRef} --json`,
    })
  })

  it('preserves the exact funding create operation without substituting the owner browser workflow', async () => {
    setApiKey('ae-test-caller-key')
    const funding = {
      action: 'funding.handoff.create',
      args: {
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
    expect(thrown.nextCommand).toBeUndefined()
    expect(thrown.next).toEqual([funding])
    expect(thrown.suggestion).toBeUndefined()
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
        args: { toolRef, input: {} },
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

  it('quotes a directory listing id once and calls the Tool the Quote resolved it to', async () => {
    setApiKey('ae-test-caller-key')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const listingRef = `registry:${'f'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse(completedCall()))
    vi.stubGlobal('fetch', fetchMock)

    await runCallCommand([listingRef], { ...options, input: '{}', idempotencyKey: 'idem-listing' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ toolRef: listingRef, input: {} })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://market.example/api/v1/tools/call')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ quoteRef, idempotencyKey: 'idem-listing' })
  })

  it('resumes a retained listing Call locally without a second Quote', async () => {
    setApiKey('ae-test-caller-key')
    const deadline = controlRequestDeadline(60_000)
    const reachedCall = Promise.withResolvers<void>()
    const listingRef = `registry:${'e'.repeat(64)}`
    try {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(toolQuote()))
        .mockImplementationOnce((_url, init) => {
          const response = stalledBody(init!.signal!)
          reachedCall.resolve()
          return Promise.resolve(response)
        })
      vi.stubGlobal('fetch', fetchMock)
      const pending = runCallCommand([listingRef], { ...options, input: '{}', idempotencyKey: 'idem-listing-timeout' })
      await Promise.race([reachedCall.promise, pending.then(() => { throw new Error('Call completed without stalling') })])
      deadline.expire()
      await pending.catch(() => undefined)
      await expect(runCallCommand([listingRef], { ...options, input: '{}' })).rejects.toMatchObject({ code: 'call-recovery-required' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      deadline.restore()
    }
  })

  it('re-quotes once when the price changed before signing, then calls the fresh Quote', async () => {
    setApiKey('ae-test-caller-key')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const freshQuoteRef = `operation-commitment:v1:${'d'.repeat(64)}`
    const priceChanged = { kind: 'refused', toolRef, code: 'price_changed', retryable: false, nextAction: 'Request a new Quote at the current price.' }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse(priceChanged))
      .mockResolvedValueOnce(jsonResponse({ ...toolQuote(), quoteRef: freshQuoteRef }))
      .mockResolvedValueOnce(jsonResponse(priceChanged))
    vi.stubGlobal('fetch', fetchMock)

    await runCallCommand([toolRef], { ...options, input: '{}', idempotencyKey: 'idem-requote' })

    expect(fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(String(init?.body))])).toEqual([
      ['https://market.example/api/v1/tools/quote', { toolRef, input: {} }],
      ['https://market.example/api/v1/tools/call', { quoteRef, idempotencyKey: 'idem-requote' }],
      ['https://market.example/api/v1/tools/quote', { toolRef, input: {} }],
      ['https://market.example/api/v1/tools/call', { quoteRef: freshQuoteRef, idempotencyKey: 'idem-requote:requote' }],
    ])
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
        callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
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

  it('announces Quote and retained Call before sending each human request', async () => {
    setApiKey('ae-test-caller-key')
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockImplementationOnce(() => {
        expect(stderr.mock.calls.flat().join('')).toBe('Requesting a Quote (up to 60 s).\n')
        expect(stdout).not.toHaveBeenCalled()
        return Promise.resolve(jsonResponse(toolQuote()))
      })
      .mockImplementationOnce(() => {
        const progress = stderr.mock.calls.flat().join('')
        expect(progress).toContain('Submitting the retained Call (up to 60 s). Recovery: ae call resume ')
        expect(progress).toContain(`--base-url ${options.baseUrl}`)
        expect(progress).not.toContain('ae-test-caller-key')
        expect(stdout).not.toHaveBeenCalled()
        return Promise.resolve(jsonResponse(completedCall()))
      }))
    await runCallCommand([toolRef], { ...options, json: false, input: '{}' })
  })

  it.each([false, true])('ends Call polling at its deadline with the same recovery identity (last request stalled: %s)', async (stall) => {
    setApiKey('ae-test-caller-key')
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const startedAt = Date.now()
    const firstPollScheduled = Promise.withResolvers<void>()
    const schedule = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      if (delay === 2_000) firstPollScheduled.resolve()
      return schedule(callback, delay, ...args)
    })
    const callRef = 'call:deadline'
    const requestTimes: number[] = []
    let finalSignal: AbortSignal | undefined
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse({ kind: 'pending', toolRef, callRef, retryAfterMs: 2_000 }))
      .mockImplementation((_url, init) => {
        requestTimes.push(Date.now() - startedAt)
        if (stall && Date.now() - startedAt >= 50_000) {
          finalSignal = init!.signal!
          return Promise.resolve(stalledBody(finalSignal))
        }
        return Promise.resolve(jsonResponse({ kind: 'found', callRef, toolRef, version: 1, state: 'in_progress' }))
      })
    vi.stubGlobal('fetch', fetchMock)
    const pending = runCallCommand([toolRef], { ...options, input: '{}', wait: true })
    const failure = expect(pending).rejects.toMatchObject({
      code: 'call-wait-timeout', detail: { callRef, identityPreserved: true },
      nextCommand: `ae status ${callRef} --base-url ${options.baseUrl} --json`,
    })
    await firstPollScheduled.promise
    await vi.advanceTimersByTimeAsync(59_999)
    if (stall) expect(finalSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
    expect(requestTimes.at(-1)).toBe(stall ? 50_000 : 58_000)
    expect(requestTimes.every(time => time < 60_000)).toBe(true)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2)
    if (stall) expect(finalSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('polls a pending Call through the authenticated status route and prints the durable terminal result', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote({ query: 'hello' })))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'pending',
        callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
        toolRef,
        retryAfterMs: 100,
      }))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'found',
        callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
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
    expect(statusUrl).toBe(`https://market.example/api/v1/calls/${encodeURIComponent("operation-invocation:v1:" + 'c'.repeat(64))}`)
    expect(statusInit?.method).toBe('GET')
    expect(new Headers(statusInit?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    const printed = JSON.parse(write.mock.calls.flat().join('')) as { kind?: string; callRef?: string; evidenceHash?: string }
    expect(printed).toMatchObject({
      kind: 'completed',
      callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
      evidenceHash: 'sha256:test',
    })
  })

  it('records a completed Call already received at the exact polling boundary', async () => {
    setApiKey('ae-test-caller-key')
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const deadline = Date.now() + 60_000
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const firstPollScheduled = Promise.withResolvers<void>()
    const schedule = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      if (delay === 2_000) firstPollScheduled.resolve()
      return schedule(callback, delay, ...args)
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse({ kind: 'pending', toolRef, callRef: `operation-invocation:v1:${'c'.repeat(64)}`, retryAfterMs: 2_000 }))
      .mockImplementationOnce(() => {
        vi.setSystemTime(deadline)
        return Promise.resolve(jsonResponse({ kind: 'found', callRef: `operation-invocation:v1:${'c'.repeat(64)}`, version: 1, toolRef, state: 'terminal', result: completedCall() }))
      })
    vi.stubGlobal('fetch', fetchMock)
    const pending = runCallCommand([toolRef], { ...options, input: '{}', wait: true })
    await firstPollScheduled.promise
    await vi.advanceTimersByTimeAsync(2_000)
    await pending
    expect(JSON.parse(stdout.mock.calls.flat().join(''))).toMatchObject({ kind: 'completed', callRef: `operation-invocation:v1:${'c'.repeat(64)}`, recoveryRef: expect.any(String) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves a structured status refusal while waiting instead of relabelling it as transport unknown', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(toolQuote()))
      .mockResolvedValueOnce(jsonResponse({
        kind: 'pending',
        callRef: `operation-invocation:v1:${'c'.repeat(64)}`,
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

  it('preserves completed usage without deriving a funding operation from charge state', async () => {
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

    const output = JSON.parse(write.mock.calls.flat().join(''))
    expect(output).toMatchObject({ kind: 'completed', usage: { chargeState: 'insufficient_credit' } })
    expect(output).not.toHaveProperty('nextCommand')
  })

  it('retains the prepared Call on a stalled acknowledgement and refuses a fresh purchase', async () => {
    setApiKey('ae-test-caller-key')
    const deadline = controlRequestDeadline(60_000)
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
