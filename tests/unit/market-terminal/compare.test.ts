import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCompareCommand } from '../../../tools/ae/commands/compare'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

const refs = [
  `operation:v1:${'a'.repeat(64)}`,
  `operation:v1:${'b'.repeat(64)}`,
]

const result = {
  kind: 'ok' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operations: [],
  facts: [{
    field: 'dataUse' as const,
    values: [{
      operationRef: refs[0]!,
      value: [{
        effectId: 'query_release',
        inputPointer: '/query',
        classification: 'public' as const,
        phase: 'execution' as const,
        recipient: 'selected_binding' as const,
        purposes: ['lookup_reference'],
      }],
      source: 'contract' as const,
    }],
  }],
  navigation: [],
}
const operation = {
  operationRef: refs[0]!,
  operationId: 'reference.lookup',
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: 'brokered',
  contract: {
    capabilityId: 'reference.lookup',
    version: 1,
    inputJsonSchema: { type: 'object' },
    outputJsonSchema: { type: 'object' },
    customerAnnotations: [],
  },
  business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
  offering: { offeringRef: 'offering:reference', revision: 1, label: 'Reference quote', summary: 'One reference quote.' },
  summary: 'Look up one reference value.',
  commercial: {
    price: { kind: 'fixed', amount: { currency: 'USD', units: '125', exponent: 2 } },
    materialTerms: [],
    relationship: { kind: 'none', summary: 'No commercial relationship.' },
  },
  dataUse: [],
  effects: [],
  evidence: [],
  cancellation: { kind: 'unsupported' },
  recovery: { idempotency: 'required', recovery: 'retry_safe' },
  authentication: { kind: 'keyless' },
  transport: { method: 'GET', pathTemplate: '/lookup', responseStatus: 200, responseContentType: 'application/json', requestTimeoutMs: 5_000 },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  availability: { posture: 'integrated', observedAt: 1_000, validUntil: 10_000 },
  navigation: [],
} as const

const humanResult = {
  kind: 'ok' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operations: [operation],
  facts: [
    {
      field: 'price' as const,
      values: [{
        operationRef: operation.operationRef,
        value: operation.commercial.price,
        source: 'publication' as const,
        observedAt: 1_000,
        validUntil: 10_000,
      }],
    },
    {
      field: 'availability' as const,
      values: [{
        operationRef: operation.operationRef,
        value: operation.availability,
        source: 'readiness' as const,
        observedAt: 1_000,
        validUntil: 10_000,
      }],
    },
  ],
  navigation: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('anonymous Operation compare CLI', () => {
  it('posts exact refs to the canonical compare route without auth', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runCompareCommand(refs, options)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/compare')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRefs: refs })
    expect(JSON.parse(output.join(''))).toEqual(result)
  })
  it('renders canonical comparison facts and gates technical identity behind --technical', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(humanResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runCompareCommand(refs, { ...options, json: false })
    const human = output.join('')
    expect(human).toContain('Reference Services — Reference quote')
    expect(human).toContain('price: USD 1.25')
    expect(human).toContain('Price:')
    expect(human).not.toContain(operation.operationRef)

    output.length = 0
    await runCompareCommand(refs, { ...options, json: false, technical: true })
    const technical = output.join('')
    expect(technical).toContain(operation.operationRef)
    expect(technical).toContain('schema: registry-operations:v1')
    expect(technical).toContain('source=publication')
  })

  it('accepts one exact ref before network work', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runCompareCommand([refs[0]!], options)

    expect(JSON.parse(output.join(''))).toEqual(result)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ operationRefs: [refs[0]] })
  })

  it.each([
    { args: [], code: 'compare-usage' },
    { args: [refs[0]!, refs[1]!, refs[0]!, refs[1]!, refs[0]!], code: 'compare-usage' },
    { args: [refs[0]!, 'not-an-operation-ref'], code: 'compare-input' },
  ])('rejects malformed or out-of-bound refs before network work', async ({ args, code }) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCompareCommand(args, options)).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
