import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runConnectCommand } from '../../../tools/ae/commands/connect'
import { runCompareCommand } from '../../../tools/ae/commands/compare'
import { runDescribeCommand } from '../../../tools/ae/commands/describe'
import { runListCommand } from '../../../tools/ae/commands/list'
import { runSearchCommand } from '../../../tools/ae/commands/search'
import { runStatusCommand } from '../../../tools/ae/commands/status'
import { runInvokeCommand } from '../../../tools/ae/commands/invoke'
import { parseArgs, type CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { storeConnection } from '../../../tools/ae/lib/config'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { projectOperationDescription, projectOperationListChoices, projectOperationSearchChoices } from '@/modules/registry/operation-choice-contracts'
import { operationDetailOutputSchema, operationSearchOutputSchema } from '@/modules/capability-supply/public'

type OperationDescriptorFixture = Readonly<{ operationRef: string; [key: string]: unknown }>
const CURRENT_OPERATION_REF = `operation:v1:${'d'.repeat(64)}`
const CURRENT_COMMITMENT_REF = `operation-commitment:v1:${'e'.repeat(64)}`

const SEARCH_ITEM_NAVIGATION = [
  { relation: 'describe', pathTemplate: '/api/v1/market-operations/describe', method: 'POST', actionId: 'registry.operations.describe', authentication: 'none' },
  { relation: 'compare', pathTemplate: '/api/v1/market-operations/compare', method: 'POST', actionId: 'registry.operations.compare', authentication: 'none' },
  { relation: 'invoke', pathTemplate: '/api/v1/operations/call', method: 'POST', actionId: 'operations.invoke', authentication: 'required' },
  { relation: 'authenticate', pathTemplate: '/oauth/device/code', method: 'POST', actionId: 'agent-access.device-code', authentication: 'none' },
] as const

function operationDescriptor(operationRef: string, summary = 'Current reference lookup') {
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
    availability: {
      posture: 'routeable',
      observedAt: Date.now(),
      validUntil: Date.now() + 60_000,
    },
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
  return projectOperationDescription(operationDetailOutputSchema.parse({
    kind: 'found' as const,
    schemaVersion: 'registry-operations:v1' as const,
    operation,
  }))
}

function operationListResult(operations: readonly OperationDescriptorFixture[]) {
  return projectOperationListChoices(operationSearchOutputSchema.parse({
    kind: 'ok' as const,
    schemaVersion: 'registry-operations:v1' as const,
    query: '',
    items: operations,
    matchedCount: operations.length,
    ranking: operations.map((operation, index) => ({
      operationRef: operation.operationRef,
      rank: index + 1,
      score: operations.length - index,
    })),
    pagination: { limit: 50, hasMore: false },
    navigation: [],
  }))
}

function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function connectedAccount() {
  return {
    kind: 'authenticated' as const,
    principalRef: 'principal:buyer',
    accountRef: 'account:buyer',
    credentialId: 'credential:buyer',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_operations:invoke', 'customer_requests:bounded_mandate'],
    authorityMode: 'bounded_mandate' as const,
  }
}

function operationInspection(
  operationRef: string,
  input: Record<string, unknown>,
  commitmentRef = CURRENT_COMMITMENT_REF,
) {
  return {
    kind: 'committed',
    commitmentRef,
    operationRef,
    operationRevision: 1,
    expiresAt: 1_900_000_000_000,
    normalizedInput: input,
    price: { currency: 'AUD', units: '1000000', exponent: 6 },
    account: {
      accountRef: 'account:cold-loop',
      available: { currency: 'AUD', units: '10000000', exponent: 6 },
    },
    budget: {
      principalRef: 'principal:cold-loop',
      maximumPerInvocation: { currency: 'AUD', units: '5000000', exponent: 6 },
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
function captureStderr(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
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
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'extract invoices', limit: 10 })
  })
  it('gives empty search results private demand memory plus a safe browse fallback', async () => {
    const result = projectOperationSearchChoices(operationSearchOutputSchema.parse({
      kind: 'no_candidates',
      schemaVersion: 'registry-operations:v1',
      query: 'invoice extraction',
      appliedFilters: {},
      matchedCount: 0,
      ranking: [],
      navigation: [],
    }))
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => responseJson(result))
    vi.stubGlobal('fetch', fetchMock)
    const jsonOutput = captureStdout()
    try {
      await runSearchCommand(['invoice extraction'], options)
    } finally {
      jsonOutput.restore()
    }
    expect(JSON.parse(jsonOutput.read())).toMatchObject({
      kind: 'no_candidates',
      nextCommand: "ae request create 'invoice extraction' --json",
      browseCommand: 'ae list --json',
      nextHref: 'https://market.example/market',
    })

    const humanOutput = captureStdout()
    try {
      await runSearchCommand(['invoice extraction'], { ...options, json: false })
    } finally {
      humanOutput.restore()
    }
    expect(humanOutput.read()).toContain('No current Operations match this job.')
    expect(humanOutput.read()).toContain("Remember this missing job: ae request create 'invoice extraction'")
    expect(humanOutput.read()).toContain('Browse all: ae list')
    expect(humanOutput.read()).toContain('https://market.example/market')

    const technicalOutput = captureStdout()
    try {
      await runSearchCommand(['invoice extraction'], {
        ...options,
        technical: true,
        filters: JSON.stringify({ healthStatus: ['degraded'] }),
      })
    } finally {
      technicalOutput.restore()
    }
    const technicalResult = JSON.parse(technicalOutput.read()) as {
      browseCommand: string
      nextCommand: string
    }
    expect(technicalResult).toMatchObject({
      nextCommand: 'ae list --filters \'{"healthStatus":["degraded"]}\' --json --technical',
      browseCommand: 'ae list --json --technical',
    })
    expect(technicalResult.nextCommand).not.toContain('request create')
    expect(technicalResult.browseCommand).not.toContain('--filters')

    const filteredHumanOutput = captureStdout()
    try {
      await runSearchCommand(['invoice extraction'], {
        ...options,
        json: false,
        filters: JSON.stringify({ healthStatus: ['degraded'] }),
      })
    } finally {
      filteredHumanOutput.restore()
    }
    expect(filteredHumanOutput.read()).toContain('No current Operations match these filters.')
    expect(filteredHumanOutput.read()).toContain('Browse matching filters: ae list --filters \'{"healthStatus":["degraded"]}\'')
    expect(filteredHumanOutput.read()).not.toContain('Remember this missing job')
  })
  it('browses all current Operations when no job is supplied', async () => {
    const operationRef = `operation:v1:${'b'.repeat(64)}`
    const result = operationListResult([operationDescriptor(operationRef)])
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseJson(result))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runListCommand([], { ...options, json: false })
    } finally {
      output.restore()
    }

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://market.example/api/v1/market-operations/list')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ limit: 50 })
    expect(output.read()).toContain('Current Operations')
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
      filters: JSON.stringify({ healthStatus: ['operational'] }),
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'reference lookup',
      limit: 3,
      cursor: 'opaque-prior-cursor',
      filters: { healthStatus: ['operational'] },
    })
    expect(JSON.parse(output.read())).toEqual({
      ...result,
      nextCommand: `ae describe ${operationRef} --json --technical`,
      nextPageCommand: `ae search 'reference lookup' --limit 3 --filters '{"healthStatus":["operational"]}' --cursor opaque-next-cursor --json --technical`,
    })
  })
  it('returns decision-sized JSON by default and keeps the full contract behind technical mode', async () => {
    const operationRefs = [
      `operation:v1:${'e'.repeat(64)}`,
      `operation:v1:${'f'.repeat(64)}`,
    ]
    const projectedResult = operationSearchResult('reference lookup', operationRefs.map((operationRef, index) => ({
      ...operationDescriptor(operationRef, `Reference lookup ${index + 1}`),
      navigation: SEARCH_ITEM_NAVIGATION,
    })))
    if (projectedResult.kind !== 'ok') throw new Error('Expected a successful search fixture')
    const result = projectedResult
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const defaultOutput = captureStdout()
    try {
      await runSearchCommand(['reference lookup'], options)
    } finally {
      defaultOutput.restore()
    }
    const defaultSerialized = defaultOutput.read()
    const defaultResult = JSON.parse(defaultSerialized) as typeof result
    const expectedDefault = {
      ...result,
      nextCommand: `ae compare ${operationRefs.join(' ')} --json`,
    }

    expect(defaultSerialized).toBe(`${JSON.stringify(expectedDefault, undefined, 2)}\n`)
    expect(defaultResult.items.map((item) => item.operationRef)).toEqual(operationRefs)
    expect(defaultResult.items.every((item) => !('navigation' in item))).toBe(true)

    const technicalOutput = captureStdout()
    try {
      await runSearchCommand(['reference lookup'], { ...options, technical: true })
    } finally {
      technicalOutput.restore()
    }
    const technicalSerialized = technicalOutput.read()

    const expectedTechnical = {
      ...result,
      nextCommand: `ae compare ${operationRefs.join(' ')} --json --technical`,
    }
    expect(technicalSerialized).toBe(`${JSON.stringify(expectedTechnical, undefined, 2)}\n`)
    expect(JSON.parse(technicalSerialized)).toEqual(expectedTechnical)
    const defaultBytes = new TextEncoder().encode(defaultSerialized).length
    expect(defaultBytes).toBeLessThanOrEqual(3 * 1024)
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

    await expect(runSearchCommand(['x'.repeat(257)], options)).rejects.toMatchObject({
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
      '{"healthStatus":["operational"]}',
    ])

    expect(parsed).toMatchObject({
      command: 'search',
      positionals: ['reference lookup'],
      options: {
        limit: '3',
        cursor: 'opaque-cursor',
        filters: '{"healthStatus":["operational"]}',
      },
    })
  })

  it('describes one exact operation anonymously', async () => {
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(
      operationDetailResult(operationDescriptor(operationRef, 'Extract invoices')),
    ), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()

    try {
      await runDescribeCommand([operationRef], options)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'found',
      schemaVersion: 'registry-operations:v2',
      operation: {
        operationRef,
        capabilityId: 'reference.lookup',
        description: 'Extract invoices',
        provider: { name: 'Reference Services', slug: 'reference' },
        priceLabel: 'USD 0.00',
        healthStatus: 'operational',
      },
    })
    expect(JSON.parse(output.read())).not.toHaveProperty('nextCommand')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/describe')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRef })
  })

  it('keeps describe output canonical and free of duplicated source navigation', async () => {
    const operationRef = `operation:v1:${'9'.repeat(64)}`
    const repeatedInputSchema = {
      type: 'object',
      properties: Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
        `field${index}`,
        { type: 'string', description: `Bounded input field ${index}` },
      ])),
    }
    const navigation = SEARCH_ITEM_NAVIGATION.map((relation) => ({
      ...relation,
      inputSchema: repeatedInputSchema,
    }))
    const operation = {
      ...operationDescriptor(operationRef, 'Detailed reference lookup'),
      navigation,
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () =>
      responseJson(operationDetailResult(operation))))

    const defaultOutput = captureStdout()
    try {
      await runDescribeCommand([operationRef], options)
    } finally {
      defaultOutput.restore()
    }
    const defaultSerialized = defaultOutput.read()
    const defaultResult = JSON.parse(defaultSerialized) as { operation: Record<string, unknown> }
    expect(defaultResult.operation).not.toHaveProperty('navigation')
    expect(defaultResult.operation).toHaveProperty('inputJsonSchema')
    expect(defaultResult).not.toHaveProperty('nextCommand')

    const technicalOutput = captureStdout()
    try {
      await runDescribeCommand([operationRef], { ...options, technical: true })
    } finally {
      technicalOutput.restore()
    }
    const technicalSerialized = technicalOutput.read()
    expect(JSON.parse(technicalSerialized)).toEqual(defaultResult)
  })

  it('keeps anonymous describe factual and sends execution to the connected agent client', async () => {
    const operationRef = `operation:v1:${'b'.repeat(64)}`
    const operation = {
      ...operationDescriptor(operationRef, 'Inspect-only continuation'),
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      responseJson(operationDetailResult(operation)),
    )
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()

    try {
      await runDescribeCommand([operationRef], { ...options, json: false })
    } finally {
      output.restore()
    }

    expect(output.read()).toContain('health: operational')
    expect(output.read()).toContain('Next: use operation.inspect from your connected agent client.')
    expect(output.read()).not.toContain('ae call')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed successful detail body with a safe CLI error', async () => {
    const operationRef = `operation:v1:${'e'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      operation: { operationRef },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(runDescribeCommand([operationRef], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'operation-describe-result-invalid',
    } satisfies Partial<CliFailure>)
  })

  it('rejects a non-canonical OperationRef before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runDescribeCommand(['operation:v1:current'], options)).rejects.toMatchObject({
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
      schemaVersion: 'registry-operations:v2' as const,
      reason: 'operation_not_found' as const,
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
    const commitments = new Map<string, {
      operationRef: string
      input: Record<string, unknown>
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
      if (route === '/api/v1/market-operations/describe') {
        return jsonResponse(operationDetailResult(operationDescriptor(operationRef, 'Current bitcoin price')))
      }
      if (
        route === '/api/v1/market-operations/compare'
      ) {
        return jsonResponse(unavailableRead)
      }
      if (route === '/api/v1/operations/inspect') {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('inspect must be authenticated')
        }
        const request = body as { operationRef: string; input: Record<string, unknown> }
        const commitmentRef = JSON.stringify(request.input) === JSON.stringify(initialInput)
          ? `operation-commitment:v1:${'1'.repeat(64)}`
          : `operation-commitment:v1:${'2'.repeat(64)}`
        commitments.set(commitmentRef, request)
        return jsonResponse(operationInspection(request.operationRef, request.input, commitmentRef))
      }
      if (route === '/api/v1/operations/call') {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('invoke must be authenticated')
        }
        const request = body as {
          commitmentRef: string
          idempotencyKey: string
        }
        const committed = commitments.get(request.commitmentRef)
        if (committed === undefined) throw new Error('invoke without inspection commitment')
        const existing = durableInvocations.get(request.idempotencyKey)
        if (existing !== undefined) {
          if (
            existing.operationRef !== committed.operationRef
            || JSON.stringify(existing.input) !== JSON.stringify(committed.input)
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
          operationRef: committed.operationRef,
          input: committed.input,
          result: completedResult,
        })
        return jsonResponse({
          kind: 'pending',
          invocationRef,
          operationRef: committed.operationRef,
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
          version: 1,
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
    await runDescribeCommand([operationRef], options)
    await expect(
      runCompareCommand([operationRef, comparisonRef], options),
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
    expect(replay).toEqual(completedResult)
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
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/describe' },
      { method: 'POST', url: 'https://market.example/api/v1/market-operations/compare' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/inspect' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
      { method: 'GET', url: `https://market.example/api/v1/operations/${encodeURIComponent(invocationRef)}` },
      { method: 'POST', url: 'https://market.example/api/v1/operations/inspect' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/inspect' },
      { method: 'POST', url: 'https://market.example/api/v1/operations/call' },
    ])
    expect(requests.map(({ authorization }) => authorization)).toEqual([
      null,
      null,
      null,
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
    ])
    expect(requests.map(({ body }) => body)).toEqual([
      { query: 'bitcoin price', limit: 10 },
      { operationRef },
      { operationRefs: [operationRef, comparisonRef] },
      { operationRef, input: initialInput },
      { commitmentRef: `operation-commitment:v1:${'1'.repeat(64)}`, idempotencyKey },
      undefined,
      { operationRef, input: initialInput },
      { commitmentRef: `operation-commitment:v1:${'1'.repeat(64)}`, idempotencyKey },
      { operationRef, input: changedInput },
      { commitmentRef: `operation-commitment:v1:${'2'.repeat(64)}`, idempotencyKey },
    ])
  })

  it('generates a durable idempotency key when call omits one', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseJson(operationInspection(CURRENT_OPERATION_REF, {})))
      .mockResolvedValueOnce(responseJson({
        kind: 'pending', invocationRef: 'invocation:generated', operationRef: CURRENT_OPERATION_REF, retryAfterMs: 100,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const output = captureStdout()
    try {
      await runInvokeCommand([CURRENT_OPERATION_REF], { ...options, input: '{}' })
    } finally {
      output.restore()
    }
    const result = JSON.parse(output.read()) as Record<string, unknown>
    expect(result).not.toHaveProperty('idempotencyKey')
    const [, init] = fetchMock.mock.calls[1]!
    const request = JSON.parse(String(init?.body)) as { idempotencyKey: string }
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns pending with a reusable key and status continuation without --wait', async () => {
    setApiKey('ae-test-caller-key')
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseJson(operationInspection(CURRENT_OPERATION_REF, {})))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      kind: 'pending',
      invocationRef: 'invocation:current',
      operationRef: CURRENT_OPERATION_REF,
      retryAfterMs: 100,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runInvokeCommand([CURRENT_OPERATION_REF], {
        ...options,
        baseUrlSource: 'flag',
        input: '{}',
        idempotencyKey: 'idem-stable',
      })
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
      operationRef: CURRENT_OPERATION_REF,
      retryAfterMs: 100,
      nextCommand: 'ae status invocation:current --base-url https://market.example --json',
    })
    expect(output.read()).not.toContain('idem-stable')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads status through the authenticated canonical route', async () => {
    const output = captureStdout()
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:current',
      version: 1,
      operationRef: CURRENT_OPERATION_REF,
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
    expect(JSON.parse(output.read())).toMatchObject({
      state: 'in_progress',
      nextCommand: 'ae status invocation:current --json',
    })
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
    const loopbackOptions = { ...options, baseUrl: 'http://127.0.0.1:3210', baseUrlSource: 'flag' as const }
    setApiKey('ae-test-caller-key', loopbackOptions.baseUrl)
    const output = captureStdout()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'found',
      invocationRef: 'invocation:current',
      version: 1,
      operationRef: CURRENT_OPERATION_REF,
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
    expect(JSON.parse(output.read())).toMatchObject({
      nextCommand: 'ae status invocation:current --base-url http://127.0.0.1:3210 --json',
    })
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
      .mockResolvedValueOnce(responseJson(connectedAccount()))
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

  it('hands a non-TTY JSON caller the safe approval details before polling completes', async () => {
    const output = captureStdout()
    const diagnostics = captureStderr()
    let resolveToken: ((response: Response) => void) | undefined
    const deferredToken = new Promise<Response>((resolve) => {
      resolveToken = resolve
    })
    let stderrAtFirstPoll = ''
    let stdoutAtFirstPoll = ''
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: 'private-client-id' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'private-device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      }))
      .mockImplementationOnce(async () => {
        stderrAtFirstPoll = diagnostics.read()
        stdoutAtFirstPoll = output.read()
        return await deferredToken
      })
      .mockResolvedValueOnce(Response.json(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)

    const connect = runConnectCommand([], options)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    const expectedHandoff = [
      'Approve: https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
      'User code: ABCD-EFGH',
      'Waiting for authorization…',
      '',
    ].join('\n')
    const stderrBeforeApproval = diagnostics.read()
    const stdoutBeforeApproval = output.read()

    resolveToken?.(Response.json({
      access_token: 'private-access-token',
      token_type: 'Bearer',
      scope: 'market_operations:invoke customer_requests:bounded_mandate',
    }))
    await connect

    try {
      expect(stderrAtFirstPoll).toBe(expectedHandoff)
      expect(stdoutAtFirstPoll).toBe('')
      expect(stderrBeforeApproval).toBe(expectedHandoff)
      expect(stdoutBeforeApproval).toBe('')

      const finalOutput = output.read()
      const result = JSON.parse(finalOutput) as Record<string, unknown>
      expect(finalOutput).toBe(`${JSON.stringify(result, undefined, 2)}\n`)
      expect(result).toMatchObject({
        kind: 'connected',
        credential: 'origin_bound_agent_key',
        credentialStored: true,
        apiKeyOrigin: 'https://market.example',
      })
      expect(diagnostics.read()).toBe(expectedHandoff)
      for (const forbidden of [
        'private-client-id',
        'private-device-code',
        'private-access-token',
        testConfigDirectory,
        'client_id=',
        'device_code=',
      ]) {
        expect(diagnostics.read()).not.toContain(forbidden)
      }
    } finally {
      output.restore()
      diagnostics.restore()
    }
  })

  it('keeps the immediate human approval and success output unchanged', async () => {
    const output = captureStdout()
    const diagnostics = captureStderr()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: 'ae_client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      }))
      .mockResolvedValueOnce(Response.json({
        access_token: 'ae-issued-secret',
        token_type: 'Bearer',
        scope: 'market_operations:invoke customer_requests:bounded_mandate',
      }))
      .mockResolvedValueOnce(Response.json(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], { ...options, json: false })
      expect(output.read()).toContain('Connect AE')
      expect(output.read()).toContain('verification  https://market.example/agent-access/authorize?user_code=ABCD-EFGH')
      expect(output.read()).toContain('user code     ABCD-EFGH')
      expect(output.read()).toContain('Approve the request, then this command will poll for the one-time credential.')
      expect(output.read()).toContain('Your agent is connected.')
      expect(output.read()).toContain('ready_to_buy')
      expect(output.read()).toContain('https://market.example/agent-access?caller=principal%3Abuyer')
      expect(output.read()).not.toContain('ae-issued-secret')
      expect(diagnostics.read()).toBe('')
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      output.restore()
      diagnostics.restore()
    }
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
      .mockResolvedValueOnce(Response.json(connectedAccount()))
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
      .mockResolvedValueOnce(Response.json(connectedAccount()))
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(responseJson(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await runConnectCommand([], options)
    } finally {
      output.restore()
    }

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/account')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-existing-secret')
    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'connected',
      credential: 'origin_bound_agent_key',
      source: 'validated_environment',
      connectionState: 'ready_to_buy',
      principalRef: 'principal:buyer',
      accountRef: 'account:buyer',
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
