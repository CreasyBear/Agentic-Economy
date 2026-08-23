import { afterEach, describe, expect, it, vi } from 'vitest'

import { runInvokeCommand } from '../../../tools/ae/commands/invoke'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

function setApiKey(value: string, origin = options.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}

describe('market-terminal authenticated operation invocation', () => {
  it('rejects a missing JSON positional before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:test'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects extra invoke positionals before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:test', '{}', 'extra'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'call-usage',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed input before requiring the application key', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:test'], { ...options, input: '{' })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-input',
    } satisfies Partial<CliFailure>)
    await expect(runInvokeCommand(['operation:v1:test'], { ...options, input: '[]' })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invoke-input',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runs an eligible free keyless call through the anonymous MCP boundary without a connection', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runInvokeCommand(
      ['operation:v1:test'],
      { ...options, input: '{"city":"Perth"}' },
      { executeAnonymousKeyless: async () => ({
        kind: 'ok',
        operationRef: 'operation:v1:test',
        capabilityId: 'weather.forecast',
        name: 'Weather forecast',
        output: { temperature: 24 },
        evidenceHash: 'sha256:evidence',
      }) },
    )

    expect(JSON.parse(write.mock.calls.flat().join(''))).toMatchObject({
      kind: 'ok',
      executionMode: 'anonymous_keyless_mcp',
      evidenceHash: 'sha256:evidence',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names connection as the next action when anonymous execution is not eligible', async () => {
    await expect(runInvokeCommand(
      ['operation:v1:test'],
      { ...options, input: '{}' },
      { executeAnonymousKeyless: async () => ({
        kind: 'refused',
        operationRef: 'operation:v1:test',
        reason: 'operation_not_keyless',
      }) },
    )).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
    } satisfies Partial<CliFailure>)
  })

  it('projects only operation input and command identity onto the canonical HTTP service', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writeError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'completed',
      invocationRef: 'invocation:one',
      operationRef: 'operation:v1:test',
      output: { value: 1 },
      evidenceHash: 'sha256:test',
      usage: {
        usageRef: 'usage:one',
        observedAt: 100,
        chargeState: 'free_tier',
        priceDigest: 'sha256:price',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runInvokeCommand(
      ['operation:v1:test'],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one' },
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(writeError).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/operations/call')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({
      operationRef: 'operation:v1:test',
      input: { query: 'hello' },
      idempotencyKey: 'idem-cli-one',
    })
    expect(String(init?.body)).not.toMatch(/endpoint|provider|credential|payment/iu)
    expect(write.mock.calls.flat().join('')).not.toContain('ae-test-caller-key')
  })
  it('polls a pending invocation through the authenticated status route and prints the durable terminal result', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'pending',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        retryAfterMs: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'found',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        state: 'terminal',
        evidenceHash: 'sha256:test',
        result: {
          kind: 'completed',
          invocationRef: 'invocation:one',
          operationRef: 'operation:v1:test',
          output: { value: 1 },
          evidenceHash: 'sha256:test',
          usage: {
            usageRef: 'usage:one',
            observedAt: 100,
            chargeState: 'free_tier',
            amount: { currency: 'USD', units: '0', exponent: 2 },
            priceDigest: 'price:test',
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runInvokeCommand(
      ['operation:v1:test'],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one', wait: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [statusUrl, statusInit] = fetchMock.mock.calls[1]!
    expect(statusUrl).toBe('https://market.example/api/v1/operations/invocation%3Aone')
    expect(statusInit?.method).toBe('GET')
    expect(new Headers(statusInit?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    const printed = JSON.parse(write.mock.calls.flat().join('')) as { kind?: string; invocationRef?: string; evidenceHash?: string }
    expect(printed).toMatchObject({
      kind: 'completed',
      invocationRef: 'invocation:one',
      evidenceHash: 'sha256:test',
    })
  })
  it('preserves a structured status refusal while waiting instead of relabelling it as transport unknown', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'pending',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        retryAfterMs: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
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

    await expect(runInvokeCommand(
      ['operation:v1:test'],
      { ...options, input: '{}', idempotencyKey: 'idem-cli-wait-503', wait: true },
    )).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'provider_unavailable',
      retryable: true,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

})
