import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'

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
const operationRef = `operation:v1:${'a'.repeat(64)}`
const commitmentRef = `operation-commitment:v1:${'b'.repeat(64)}`

function inspection(input: Record<string, unknown> = {}) {
  return {
    kind: 'committed',
    commitmentRef,
    operationRef,
    operationRevision: 1,
    expiresAt: 1_900_000_000_000,
    normalizedInput: input,
    price: { currency: 'AUD', units: '0', exponent: 6 },
    account: {
      accountRef: 'account:test',
      available: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    budget: {
      principalRef: 'principal:test',
      maximumPerInvocation: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    policyRefs: ['commercial-policy:sandbox'],
    evidenceDigest: 'sha256:inspection',
    continuation: {
      action: 'operation.invoke',
      method: 'POST',
      path: '/api/v1/operations/call',
      input: { commitmentRef, idempotencyKey: 'replace-at-invocation' },
    },
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
})

function setApiKey(value: string, origin = options.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}

describe('market-terminal authenticated operation invocation', () => {
  it('checks anonymous availability before suggesting buyer connection', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(
      callableOperationDetail(operationRef),
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand([operationRef], { ...options, input: '{}' })).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      nextCommand: 'ae connect',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/detail')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRef })
  })

  it('does not suggest connect or retry when supplier setup is incomplete', async () => {
    const operationRef = `operation:v1:${'b'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'unavailable',
      schemaVersion: 'registry-operations:v1',
      operationRef,
      reason: 'setup_required',
      navigation: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand([operationRef], { ...options, input: '{}' })).rejects.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'setup_required',
      retryable: undefined,
      nextCommand: undefined,
      suggestion: undefined,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

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

  it('projects only operation input and command identity onto the canonical HTTP service', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const writeError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(inspection({ query: 'hello' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
      [operationRef],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(writeError).not.toHaveBeenCalled()
    const [inspectUrl, inspectInit] = fetchMock.mock.calls[0]!
    expect(inspectUrl).toBe('https://market.example/api/v1/operations/inspect')
    expect(JSON.parse(String(inspectInit?.body))).toEqual({ operationRef, input: { query: 'hello' } })
    const [url, init] = fetchMock.mock.calls[1]!
    expect(url).toBe('https://market.example/api/v1/operations/call')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(init?.redirect).toBe('manual')
    expect(JSON.parse(String(init?.body))).toEqual({
      commitmentRef,
      idempotencyKey: 'idem-cli-one',
    })
    expect(String(init?.body)).not.toMatch(/endpoint|provider|credential|payment/iu)
    const stdout = write.mock.calls.flat().join('')
    expect(stdout).not.toContain('ae-test-caller-key')
    expect(stdout).not.toContain('idem-cli-one')
  })

  it('reads piped JSON input and sends the same canonical operation payload', async () => {
    setApiKey('ae-test-caller-key')
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(inspection({ query: 'hello from stdin' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      kind: 'completed',
      invocationRef: 'invocation:stdin',
      operationRef: 'operation:v1:test',
      output: { value: 1 },
      evidenceHash: 'sha256:stdin',
      usage: {
        usageRef: 'usage:stdin',
        observedAt: 100,
        chargeState: 'free_tier',
        priceDigest: 'sha256:price',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runInvokeCommand(
      [operationRef],
      { ...options, input: '-', idempotencyKey: 'idem-cli-stdin' },
      Readable.from(['{"query":"hello from stdin"}']),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      commitmentRef,
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
      failure: { kind: 'INVALID_ARGUMENT', code: 'invoke-input' },
    },
    {
      name: 'non-object',
      contents: '[]',
      failure: { kind: 'INVALID_ARGUMENT', code: 'invoke-input' },
    },
    {
      name: 'oversized',
      contents: 'x'.repeat((256 * 1024) + 1),
      failure: { kind: 'PAYLOAD_TOO_LARGE', code: 'payload_too_large' },
    },
  ])('rejects $name piped input before any network request', async ({ contents, failure }) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(
      ['operation:v1:test'],
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
      .mockResolvedValueOnce(jsonResponse(inspection()))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      kind: 'pending',
      invocationRef: 'invocation:one',
      operationRef: 'operation:v1:test',
      retryAfterMs: 100,
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await runInvokeCommand([operationRef], {
      ...options,
      json: false,
      input: '{}',
      idempotencyKey: 'FAKE_IDEMPOTENCY_SENTINEL',
    })

    expect(stdout.mock.calls.flat().join('')).not.toContain('FAKE_IDEMPOTENCY_SENTINEL')
    expect(stderr.mock.calls.flat().join('')).not.toContain('FAKE_IDEMPOTENCY_SENTINEL')
  })
  it('polls a pending invocation through the authenticated status route and prints the durable terminal result', async () => {
    setApiKey('ae-test-caller-key')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(inspection({ query: 'hello' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'pending',
        invocationRef: 'invocation:one',
        operationRef: 'operation:v1:test',
        retryAfterMs: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: 'found',
        invocationRef: 'invocation:one',
        version: 1,
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
      [operationRef],
      { ...options, input: '{"query":"hello"}', idempotencyKey: 'idem-cli-one', wait: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [statusUrl, statusInit] = fetchMock.mock.calls[2]!
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
      .mockResolvedValueOnce(jsonResponse(inspection()))
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
      [operationRef],
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
      .mockResolvedValueOnce(jsonResponse(inspection()))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      kind: 'completed',
      invocationRef: 'invocation:credit',
      operationRef: 'operation:v1:test',
      output: {},
      evidenceHash: 'sha256:credit',
      usage: {
        usageRef: 'usage:credit',
        observedAt: 100,
        chargeState: 'insufficient_credit',
        amount: { currency: 'USD', units: '100', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await runInvokeCommand([operationRef], {
      ...options,
      input: '{}',
      idempotencyKey: 'idem-credit',
    })

    expect(JSON.parse(write.mock.calls.flat().join(''))).toMatchObject({
      kind: 'completed',
      nextCommand: 'ae account balance --json',
    })
  })

})

function callableOperationDetail(operationRef: string): Record<string, unknown> {
  return {
    kind: 'found',
    schemaVersion: 'registry-operations:v1',
    operation: {
      operationRef,
      operationId: 'reference.lookup',
      callVia: '/api/v1/operations/call',
      paymentLane: 'brokered',
      contract: {
        capabilityId: 'reference.lookup', version: 1,
        inputJsonSchema: { type: 'object' }, outputJsonSchema: { type: 'object' },
        customerAnnotations: [],
      },
      business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
      offering: { offeringRef: 'offering:reference', revision: 1, label: 'Reference lookup', summary: 'Look up a reference.' },
      summary: 'Look up a reference.',
      commercial: {
        price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
        materialTerms: [], relationship: { kind: 'none', summary: 'No commercial relationship.' },
      },
      dataUse: [], effects: [], evidence: [],
      cancellation: { kind: 'unsupported' },
      recovery: { idempotency: 'required', recovery: 'retry_safe' },
      authentication: { kind: 'ae_api_key' },
      transport: { method: 'GET', pathTemplate: '/lookup', responseStatus: 200, responseContentType: 'application/json', requestTimeoutMs: 5_000 },
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'invoke', pathTemplate: '/api/v1/operations/call', method: 'POST',
        actionId: 'agentic-economy.operation-invoke', authentication: 'required', surfaces: ['cli'],
      }],
    },
  }
}
