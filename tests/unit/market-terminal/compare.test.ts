import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCompareCommand } from '../../../tools/ae/commands/compare'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { commandUsage } from '../../../tools/ae/lib/help'
import { CliFailure } from '../../../tools/ae/lib/output'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { projectOperationCompareChoices } from '@/modules/registry/operation-choice-contracts'
import { operationCompareOutputSchema } from '@/modules/capability-supply/public'

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
  authentication: { kind: 'ae_api_key' },
  transport: { method: 'GET', pathTemplate: '/lookup', responseStatus: 200, responseContentType: 'application/json', requestTimeoutMs: 5_000 },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  availability: { posture: 'setup_required', observedAt: 1_000, validUntil: 10_000 },
  navigation: [],
} as const

const humanResult = projectOperationCompareChoices(operationCompareOutputSchema.parse({
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
}))
const result = humanResult

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

    await runCompareCommand(refs, { ...options, technical: true })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-operations/compare')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBeNull()
    expect(JSON.parse(String(init?.body))).toEqual({ operationRefs: refs })
    expect(JSON.parse(output.join(''))).toEqual({
      ...result,
      nextCommands: [{
        operationRef: operation.operationRef,
        command: `ae describe ${operation.operationRef} --json --technical`,
      }],
    })
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
    expect(human).toContain('indicative price: USD 1.25')
    expect(human).toContain('Choose one Provider, then describe its exact Operation:')
    expect(human).toContain(`ae describe ${operation.operationRef}`)

    output.length = 0
    await runCompareCommand(refs, { ...options, json: false, technical: true })
    const technical = output.join('')
    expect(technical).toContain(operation.operationRef)
    expect(technical).toContain('schema: registry-operations:v2')
    expect(technical).toContain('capability=reference.lookup')
  })

  it('hands one exact ref to inspect without performing meaningless comparison work', async () => {
    expect(commandUsage('compare')).toBe(
      'ae compare <operation-ref> <operation-ref> [<operation-ref> ...]',
    )
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runCompareCommand([refs[0]!], {
      ...options,
      baseUrl: 'http://[::1]:3024',
      baseUrlSource: 'flag',
      technical: true,
    })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'compare-needs-alternative',
      suggestion: 'Describe this Operation directly, or search for another Provider to compare.',
      nextCommand: `ae describe ${refs[0]} --base-url 'http://[::1]:3024' --json --technical`,
    } satisfies Partial<CliFailure>)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns one exact inspect continuation per supplier and preserves the selected origin and output mode', async () => {
    const output: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })
    const secondOperation = {
      ...operation,
      operationRef: refs[1]!,
      business: { businessId: 'business:alternative', slug: 'alternative', name: 'Alternative Services' },
    }
    const compared = projectOperationCompareChoices(operationCompareOutputSchema.parse({
      kind: 'ok',
      schemaVersion: 'registry-operations:v1',
      operations: [operation, secondOperation],
      facts: [],
      navigation: [],
    }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(compared), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await runCompareCommand(refs, {
      ...options,
      baseUrl: 'http://[::1]:3024',
      baseUrlSource: 'flag',
      technical: true,
    })

    expect(JSON.parse(output.join(''))).toEqual({
      ...compared,
      nextCommands: refs.map((operationRef) => ({
        operationRef,
        command: `ae describe ${operationRef} --base-url 'http://[::1]:3024' --json --technical`,
      })),
    })
    expect(output.join('')).not.toMatch(/credential|password|secret|idempotency/iu)
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
