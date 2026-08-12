import { afterEach, describe, expect, it, vi } from 'vitest'

import { runConnectCommand } from '../../../tools/ae/commands/connect'
import { runInspectCommand } from '../../../tools/ae/commands/inspect'
import { runSearchCommand } from '../../../tools/ae/commands/search'
import { runStatusCommand } from '../../../tools/ae/commands/status'
import { runInvokeCommand } from '../../../tools/ae/commands/invoke'
import { runImportCommand } from '../../../tools/ae/commands/import'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}
function setApiKey(value: string, origin = options.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}


afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('external-agent Market Operation cold loop', () => {
  it('searches anonymously over the public Operation route', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'ok',
      query: 'extract invoices',
      items: [{ operationRef: 'operation:v1:current' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runSearchCommand(['extract invoices'], options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/search')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'extract invoices' })
  })
  it('rejects an overlong search query before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runSearchCommand(['x'.repeat(201)], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'search-query-too-long',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('imports one absolute HTTP URL through the demand route', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'unavailable',
      reason: 'test',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runImportCommand(['https://supplier.example/catalog'], options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/storefront/import-draft')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ websiteUrl: 'https://supplier.example/catalog' })
  })

  it('rejects invalid demand import URLs and extra positionals before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const invalidCases: readonly { args: readonly string[]; code: string }[] = [
      { args: [], code: 'import-usage' },
      { args: ['https://supplier.example/catalog', 'extra'], code: 'import-usage' },
      { args: ['javascript:alert(1)'], code: 'import-url-invalid' },
      { args: ['file:///tmp/catalog'], code: 'import-url-invalid' },
      { args: ['supplier.example/catalog'], code: 'import-url-invalid' },
    ]

    for (const invalidCase of invalidCases) {
      await expect(runImportCommand(invalidCase.args, options)).rejects.toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code: invalidCase.code,
      } satisfies Partial<CliFailure>)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('inspects one exact operation anonymously', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      operation: { operationRef, summary: 'Extract invoices' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runInspectCommand([operationRef], options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/detail')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRef })
  })

  it('rejects a non-canonical OperationRef before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInspectCommand(['operation:v1:current'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'operation-ref-invalid',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an explicit stable idempotency key before invoke network work', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInvokeCommand(['operation:v1:current', '{}'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'idempotency-key-required',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns pending with a reusable key and status continuation without --wait', async () => {
    setApiKey('ae-test-caller-key')
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'pending',
      invocationRef: 'invocation:current',
      operationRef: 'operation:v1:current',
      retryAfterMs: 100,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runInvokeCommand(['operation:v1:current', '{}'], { ...options, idempotencyKey: 'idem-stable' })
    } finally {
      output.restore()
    }

    const printed = JSON.parse(output.read()) as {
      kind: string
      invocationRef: string
      operationRef: string
      retryAfterMs: number
      idempotencyKey: string
      nextCommand: string
    }
    expect(printed).toEqual({
      kind: 'pending',
      invocationRef: 'invocation:current',
      operationRef: 'operation:v1:current',
      retryAfterMs: 100,
      idempotencyKey: 'idem-stable',
      nextCommand: 'npm run -s ae -- status invocation:current',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reads status through the authenticated canonical route', async () => {
    const output = captureStdout()
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:current',
      operationRef: 'operation:v1:current',
      state: 'in_progress',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runStatusCommand(['invocation:current'], options)
    } finally {
      output.restore()
    }
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/operations/invocation%3Acurrent')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
  })

  it('refuses a missing API key origin before any credentialed fetch', async () => {
    setApiKey('ae-test-caller-key')
    delete process.env.AE_API_KEY_ORIGIN
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runStatusCommand(['invocation:current'], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_required',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses HTTPS and HTTP attacker base-url overrides before any credentialed fetch', async () => {
    process.env.AE_API_KEY = 'ae-test-caller-key'
    process.env.AE_API_KEY_ORIGIN = 'https://market.example'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    for (const baseUrl of ['https://attacker.example', 'http://attacker.example']) {
      await expect(runStatusCommand(['invocation:current'], { ...options, baseUrl })).rejects.toMatchObject({
        kind: 'INVALID_ARGUMENT',
        code: 'agent_access_key_origin_mismatch',
      } satisfies Partial<CliFailure>)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows matching loopback HTTP development credentials', async () => {
    const loopbackOptions = { ...options, baseUrl: 'http://127.0.0.1:3210' }
    setApiKey('ae-test-caller-key', loopbackOptions.baseUrl)
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:current',
      operationRef: 'operation:v1:current',
      state: 'in_progress',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runStatusCommand(['invocation:current'], loopbackOptions)
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:3210/api/v1/operations/invocation%3Acurrent')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
  })

  it('uses the existing OAuth device flow and returns the one-time AE credential', async () => {
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'ae_client' }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'ae-issued-secret',
        token_type: 'Bearer',
        scope: 'market_operations:invoke',
        expires_in: 604800,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], options)
    } finally {
      output.restore()
    }

    const registration = fetchMock.mock.calls[0]!
    expect(registration[0]).toBe('https://market.example/oauth/register')
    expect(JSON.parse(String(registration[1]?.body))).toMatchObject({
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      token_endpoint_auth_method: 'none',
      scope: 'market_operations:invoke',
    })
    const deviceAuthorization = fetchMock.mock.calls[1]!
    expect(deviceAuthorization[0]).toBe('https://market.example/oauth/device_authorization')
    expect(String(deviceAuthorization[1]?.body)).toContain('client_id=ae_client')
    const token = fetchMock.mock.calls[2]!
    expect(token[0]).toBe('https://market.example/oauth/token')
    expect(String(token[1]?.body)).toContain('device_code=device-code')
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'connected',
      access_token: 'ae-issued-secret',
      apiKeyOrigin: 'https://market.example',
    })
  })

  it('refuses an existing key origin mismatch before connect validation fetch', async () => {
    process.env.AE_API_KEY = 'ae-existing-secret'
    process.env.AE_API_KEY_ORIGIN = 'https://attacker.example'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runConnectCommand([], options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'agent_access_key_origin_mismatch',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates an existing AE_API_KEY before reporting connected', async () => {
    setApiKey('ae-existing-secret')
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      kind: 'refused',
      invocationRef: 'invocation:v1:connect-validation',
      code: 'invocation_not_found',
      retryable: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], options)
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/operations/invocation%3Av1%3Aconnect-validation')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-existing-secret')
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'connected',
      credential: 'AE_API_KEY',
      source: 'validated_environment',
      apiKeyOrigin: 'https://market.example',
    })
  })

  it('refuses a fake configured key instead of claiming connected', async () => {
    setApiKey('fake-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      type: 'about:blank',
      title: 'Unauthenticated',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
    }), { status: 401, headers: { 'content-type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runConnectCommand([], options)).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'api_key_invalid',
    } satisfies Partial<CliFailure>)
  })
})
