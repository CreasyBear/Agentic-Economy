import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runConnectCommand } from '../../../tools/ae/commands/connect'
import { runCompareCommand } from '../../../tools/ae/commands/compare'
import { runInspectPlanCommand } from '../../../tools/ae/commands/inspect-plan'
import { runInspectCommand } from '../../../tools/ae/commands/inspect'
import { runSearchCommand } from '../../../tools/ae/commands/search'
import { runStatusCommand } from '../../../tools/ae/commands/status'
import { runInvokeCommand } from '../../../tools/ae/commands/invoke'
import { parseArgs, type CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { storeConnection } from '../../../tools/ae/lib/config'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { projectOperationSearchChoices } from '@/modules/registry/operation-choice-contracts'
import { operationSearchOutputSchema } from '@/modules/capability-supply/public'

type OperationDescriptorFixture = Readonly<{ operationRef: string; [key: string]: unknown }>

function operationDescriptor(operationRef: string, summary = 'Current reference lookup'): OperationDescriptorFixture {
  return {
    operationRef,
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: 'brokered',
    operationId: 'reference.lookup',
    contract: {
      capabilityId: 'reference.lookup',
      version: 1,
      inputJsonSchema: { type: 'object' },
      outputJsonSchema: { type: 'object' },
      customerAnnotations: [],
    },
    business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
    offering: { offeringRef: 'offering:reference', revision: 1, label: 'Reference lookup', summary },
    summary,
    commercial: {
      price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No commercial relationship.' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'required', recovery: 'retry_safe' },
    authentication: { kind: 'ae_api_key' },
    transport: { method: 'GET', pathTemplate: '/lookup', responseStatus: 200, responseContentType: 'application/json', requestTimeoutMs: 5_000 },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    availability: { posture: 'integrated' },
    navigation: [],
  }
}

function operationSearchResult(query: string, operations: readonly OperationDescriptorFixture[]) {
  return projectOperationSearchChoices(operationSearchOutputSchema.parse({
    kind: 'ok' as const,
    schemaVersion: 'registry-operations:v1' as const,
    query,
    items: operations,
    matchedCount: operations.length,
    ranking: operations.map((operation, index) => ({
      operationRef: operation.operationRef,
      rank: index + 1,
      score: operations.length - index,
    })),
    pagination: { limit: 20, hasMore: false },
    navigation: [],
  }))
}

function operationDetailResult(operation: OperationDescriptorFixture) {
  return {
    kind: 'found' as const,
    schemaVersion: 'registry-operations:v1' as const,
    operation,
  }
}
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

let testConfigDirectory = ''

beforeEach(() => {
  testConfigDirectory = mkdtempSync(join(tmpdir(), 'ae-cli-cold-loop-'))
  process.env.AE_CONFIG_DIR = testConfigDirectory
})


afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  delete process.env.AE_CONFIG_DIR
  rmSync(testConfigDirectory, { recursive: true, force: true })
})

describe('external-agent Market Operation cold loop', () => {
  it('searches anonymously over the public Operation route', async () => {
    const operationRef = `operation:v1:${'c'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(
      operationSearchResult('extract invoices', [operationDescriptor(operationRef)]),
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await runSearchCommand(['extract invoices'], options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/search')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'extract invoices' })
  })
  it('rejects a malformed successful search body with a safe CLI error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'ok',
      query: 'extract invoices',
      items: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runSearchCommand(['extract invoices'], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'operation-search-result-invalid',
    } satisfies Partial<CliFailure>)
  })

  it('sends canonical pagination/filter inputs and preserves the response cursor fields', async () => {
    const operationRef = `operation:v1:${'d'.repeat(64)}`
    const result = {
      ...operationSearchResult('reference lookup', [operationDescriptor(operationRef)]),
      pagination: { limit: 3, nextCursor: 'opaque-next-cursor', hasMore: true },
    }
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runSearchCommand(['reference lookup'], {
      ...options,
      technical: true,
      limit: '3',
      cursor: 'opaque-prior-cursor',
      filters: JSON.stringify({ availability: ['routeable'] }),
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'reference lookup',
      limit: 3,
      cursor: 'opaque-prior-cursor',
      filters: { availability: ['routeable'] },
    })
    expect(JSON.parse(output.read())).toEqual({
      ...result,
      nextCommand: `ae search 'reference lookup' --limit 3 --filters '{"availability":["routeable"]}' --cursor opaque-next-cursor`,
    })
  })
  it('returns decision-sized JSON by default and keeps the full contract behind technical mode', async () => {
    const operationRef = `operation:v1:${'e'.repeat(64)}`
    const result = operationSearchResult('reference lookup', [operationDescriptor(operationRef)])
    const output = captureStdout()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await runSearchCommand(['reference lookup'], options)

    const serialized = output.read()
    const compact = JSON.parse(serialized) as Record<string, unknown>
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(4 * 1024)
    expect(compact).toHaveProperty('items')
    expect(serialized).not.toContain('inputJsonSchema')
    expect(serialized).not.toContain('outputJsonSchema')
  })
  it('rejects an out-of-range search limit before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runSearchCommand(['reference lookup'], { ...options, limit: '21' })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'search-limit-invalid',
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('parses search pagination and filter flags through the existing argument model', () => {
    const parsed = parseArgs([
      'search',
      'reference lookup',
      '--limit',
      '3',
      '--cursor',
      'opaque-cursor',
      '--filters',
      '{"availability":["routeable"]}',
    ])

    expect(parsed).toMatchObject({
      command: 'search',
      positionals: ['reference lookup'],
      options: {
        limit: '3',
        cursor: 'opaque-cursor',
        filters: '{"availability":["routeable"]}',
      },
    })
  })

  it('inspects one exact operation anonymously', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(
      operationDetailResult(operationDescriptor(operationRef, 'Extract invoices')),
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()

    try {
      await runInspectCommand([operationRef], options)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'found',
      operation: {
        callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
        paymentLane: 'brokered',
      },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/detail')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRef })
  })
  it('rejects a malformed successful detail body with a safe CLI error', async () => {
    const operationRef = `operation:v1:${'e'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      operation: { operationRef },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runInspectCommand([operationRef], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'operation-detail-result-invalid',
    } satisfies Partial<CliFailure>)
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
  it('completes the anonymous-to-authenticated operation lifecycle with durable replay', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const comparisonRef = `operation:v1:${'b'.repeat(64)}`
    const invocationRef = `invocation:v1:${'c'.repeat(64)}`
    const idempotencyKey = 'cold-loop-idempotency'
    const initialInput = { query: 'bitcoin price' }
    const changedInput = { query: 'ethereum price' }
    const completedResult = {
      kind: 'completed' as const,
      invocationRef,
      operationRef,
      output: { value: 42, currency: 'USD' },
      evidenceHash: 'sha256:cold-loop-effect',
      usage: {
        usageRef: 'usage:cold-loop',
        observedAt: 1,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 2 },
        priceDigest: 'sha256:cold-loop-price',
      },
    }
    const unavailableRead = {
      kind: 'unavailable' as const,
      schemaVersion: 'registry-operations:v1' as const,
      reason: 'operation_not_found' as const,
      navigation: [],
    }
    const requests: Array<{
      url: string
      method: string
      authorization: string | null
      body: unknown
    }> = []
    const durableInvocations = new Map<string, {
      operationRef: string
      input: Record<string, unknown>
      result: typeof completedResult
    }>()
    let providerEffects = 0
    const jsonResponse = (body: unknown, status = 200, contentType = 'application/json') => (
      new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })
    )
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const authorization = new Headers(init?.headers).get('Authorization')
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
      requests.push({ url, method, authorization, body })
      const route = new URL(url).pathname

      if (route === '/api/v1/market-operations/search') {
        return jsonResponse(operationSearchResult('bitcoin price', [
          operationDescriptor(operationRef, 'Current bitcoin price'),
          operationDescriptor(comparisonRef, 'Comparison bitcoin price'),
        ]))
      }
      if (route === '/api/v1/market-operations/detail') {
        return jsonResponse(operationDetailResult(operationDescriptor(operationRef, 'Current bitcoin price')))
      }
      if (
        route === '/api/v1/market-operations/compare'
        || route === '/api/v1/market-operations/inspect-plan'
      ) {
        return jsonResponse(unavailableRead)
      }
      if (route === '/api/v1/operations/call') {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('invoke must be authenticated')
        }
        const request = body as {
          operationRef: string
          input: Record<string, unknown>
          idempotencyKey: string
        }
        const existing = durableInvocations.get(request.idempotencyKey)
        if (existing !== undefined) {
          if (
            existing.operationRef !== request.operationRef
            || JSON.stringify(existing.input) !== JSON.stringify(request.input)
          ) {
            return jsonResponse({
              type: 'about:blank',
              title: 'Already exists',
              status: 409,
              kind: 'ALREADY_EXISTS',
              code: 'idempotency_conflict',
              detail: 'The idempotency key is already bound to different operation input.',
              retryable: false,
            }, 409, 'application/problem+json')
          }
          return jsonResponse(existing.result)
        }

        providerEffects += 1
        durableInvocations.set(request.idempotencyKey, {
          operationRef: request.operationRef,
          input: request.input,
          result: completedResult,
        })
        return jsonResponse({
          kind: 'pending',
          invocationRef,
          operationRef: request.operationRef,
          retryAfterMs: 100,
        })
      }
      if (route === `/api/v1/operations/${encodeURIComponent(invocationRef)}`) {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('status must be authenticated')
        }
        const existing = durableInvocations.get(idempotencyKey)
        if (existing === undefined) throw new Error('status read before invocation')
        return jsonResponse({
          kind: 'found',
          invocationRef,
          operationRef,
          state: 'terminal',
          evidenceHash: existing.result.evidenceHash,
          result: existing.result,
        })
      }
      throw new Error(`Unexpected CLI route: ${method} ${url}`)
    })
    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    vi.stubGlobal('fetch', fetchMock)

    await runSearchCommand(['bitcoin', 'price'], options)
    await runInspectCommand([operationRef], options)
    await expect(
      runCompareCommand([operationRef, comparisonRef], options),
    ).rejects.toMatchObject({
      kind: 'NOT_FOUND',
      code: 'operation_not_found',
      exitCode: 1,
    } satisfies Partial<CliFailure>)
    await expect(
      runInspectPlanCommand([operationRef, comparisonRef], options),
    ).rejects.toMatchObject({
      kind: 'NOT_FOUND',
      code: 'operation_not_found',
      exitCode: 1,
    } satisfies Partial<CliFailure>)

    setApiKey('ae-test-caller-key')
    const invokeOptions = { ...options, idempotencyKey, wait: false }
    const readJsonOutput = async (run: () => Promise<void>): Promise<Record<string, unknown>> => {
      const start = writes.length
      await run()
      return JSON.parse(writes.slice(start).join('')) as Record<string, unknown>
    }
    const pending = await readJsonOutput(() => runInvokeCommand(
      [operationRef],
      { ...invokeOptions, input: JSON.stringify(initialInput) },
    ))
    expect(pending).toMatchObject({ kind: 'pending', invocationRef, operationRef })
    expect(pending).not.toHaveProperty('idempotencyKey')

    const status = await readJsonOutput(() => runStatusCommand([invocationRef], invokeOptions))
    expect(status).toMatchObject({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
      result: completedResult,
    })

    const replay = await readJsonOutput(() => runInvokeCommand(
      [operationRef],
      { ...invokeOptions, input: JSON.stringify(initialInput) },
    ))
    expect(replay).toEqual({
      ...completedResult,
      nextCommand: `ae status ${invocationRef}`,
    })
    expect(status.result).toEqual(completedResult)

    await expect(runInvokeCommand(
      [operationRef],
      { ...invokeOptions, input: JSON.stringify(changedInput) },
    )).rejects.toMatchObject({
      kind: 'ALREADY_EXISTS',
      code: 'idempotency_conflict',
    } satisfies Partial<CliFailure>)

    expect(providerEffects).toBe(1)
    expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/search' },
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/detail' },
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/compare' },
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/inspect-plan' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
      { method: 'GET', url: `https://market.example/api/v1/operations/${encodeURIComponent(invocationRef)}` },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
    ])
    expect(requests.map(({ authorization }) => authorization)).toEqual([
      null,
      null,
      null,
      null,
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
    ])
    expect(requests.map(({ body }) => body)).toEqual([
      { query: 'bitcoin price' },
      { operationRef },
      { operationRefs: [operationRef, comparisonRef] },
      { operationRefs: [operationRef, comparisonRef] },
      { operationRef, input: initialInput, idempotencyKey },
      undefined,
      { operationRef, input: initialInput, idempotencyKey },
      { operationRef, input: changedInput, idempotencyKey },
    ])
  })

  it('generates a durable idempotency key when call omits one', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'pending', invocationRef: 'invocation:generated', operationRef: 'operation:v1:current', retryAfterMs: 100,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const output = captureStdout()
    try {
      await runInvokeCommand(['operation:v1:current'], { ...options, input: '{}' })
    } finally {
      output.restore()
    }
    const result = JSON.parse(output.read()) as Record<string, unknown>
    expect(result).not.toHaveProperty('idempotencyKey')
    const [, init] = fetchMock.mock.calls[0]!
    const request = JSON.parse(String(init?.body)) as { idempotencyKey: string }
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u)
    expect(fetchMock).toHaveBeenCalledOnce()
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
      await runInvokeCommand(['operation:v1:current'], { ...options, input: '{}', idempotencyKey: 'idem-stable' })
    } finally {
      output.restore()
    }

    const printed = JSON.parse(output.read()) as {
      kind: string
      invocationRef: string
      operationRef: string
      retryAfterMs: number
      nextCommand: string
    }
    expect(printed).toEqual({
      kind: 'pending',
      invocationRef: 'invocation:current',
      operationRef: 'operation:v1:current',
      retryAfterMs: 100,
      nextCommand: 'ae status invocation:current',
    })
    expect(output.read()).not.toContain('idem-stable')
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
        scope: 'market_operations:invoke customer_requests:bounded_mandate',
        expires_in: 604800,
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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

    const registration = fetchMock.mock.calls[0]!
    expect(registration[0]).toBe('https://market.example/oauth/register')
    expect(JSON.parse(String(registration[1]?.body))).toMatchObject({
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      token_endpoint_auth_method: 'none',
      scope: 'market_operations:invoke customer_requests:bounded_mandate',
    })
    const deviceAuthorization = fetchMock.mock.calls[1]!
    expect(deviceAuthorization[0]).toBe('https://market.example/oauth/device_authorization')
    expect(String(deviceAuthorization[1]?.body)).toContain('client_id=ae_client')
    const token = fetchMock.mock.calls[2]!
    expect(token[0]).toBe('https://market.example/oauth/token')
    expect(String(token[1]?.body)).toContain('device_code=device-code')
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'connected',
      credential: 'origin_bound_agent_key',
      credentialStored: true,
      apiKeyOrigin: 'https://market.example',
    })
    expect(output.read()).not.toContain('ae-issued-secret')
  })

  it('waits for a newly issued Clerk key to reach the authentication edge', async () => {
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: 'ae_client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 1,
      }))
      .mockResolvedValueOnce(Response.json({ access_token: 'ae-issued-secret' }))
      .mockResolvedValueOnce(Response.json({
        type: 'about:blank',
        title: 'Unauthenticated',
        status: 401,
        kind: 'UNAUTHENTICATED',
        code: 'authentication_required',
      }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        kind: 'refused',
        invocationRef: 'invocation:v1:connect-validation',
        code: 'invocation_not_found',
        retryable: false,
      }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], options)
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(JSON.parse(output.read())).toMatchObject({ kind: 'connected', credentialStored: true })
  })

  it('replaces a rejected stored key through the device flow', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'stale-stored-key' })
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        type: 'about:blank',
        title: 'Unauthenticated',
        status: 401,
        kind: 'UNAUTHENTICATED',
        code: 'authentication_required',
      }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ client_id: 'ae_client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 1,
      }))
      .mockResolvedValueOnce(Response.json({ access_token: 'replacement-key' }))
      .mockResolvedValueOnce(Response.json({
        kind: 'refused',
        invocationRef: 'invocation:v1:connect-validation',
        code: 'invocation_not_found',
        retryable: false,
      }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], options)
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(JSON.parse(output.read())).toMatchObject({ kind: 'connected', credentialStored: true })
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
      credential: 'origin_bound_agent_key',
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
