import { afterEach, describe, expect, it } from 'vitest'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { createProcurementEngine, handleToolProcurePost } from '@/lib/server/procure-api'
import type { CatalogToolCandidate } from '@/modules/capability-execution/procure-engine'

const TEST_CATALOG: readonly CatalogToolCandidate[] = [
  {
    toolRef: 'operation:v1:timezone_converter',
    name: 'Timezone Converter Service',
    description: 'Convert time between international timezones. Fixed price in AUD.',
    endpoint: 'https://api.timezone.example/convert',
    priceAud: '0.002',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin timezone' },
        to: { type: 'string', description: 'Target timezone' },
        time: { type: 'string', description: 'Time to convert' },
      },
    },
  },
  {
    toolRef: 'operation:v1:benchmark_tool',
    name: 'Benchmark Reference Tool',
    description: 'High priced benchmarking tool.',
    endpoint: '/api/v1/benchmark',
    priceAud: '1.000',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'Benchmark request' },
      },
    },
  },
]

const testEngine = createProcurementEngine({
  catalogSearcher: async (query: string) => {
    return TEST_CATALOG.filter((tool) =>
      query.toLowerCase().split(/\s+/).some((t) =>
        t.length > 2 && (tool.name.toLowerCase().includes(t) || tool.description.toLowerCase().includes(t)),
      ),
    )
  },
  callExecutor: async (req) => {
    if (req.simulateProviderFailure) {
      return {
        status: 200,
        payload: {
          error: `upstream_gateway_timeout: ${req.tool.name} failed`,
          code: 'ETIMEDOUT',
        },
      }
    }
    return {
      status: 200,
      payload: {
        result: { convertedTime: '2026-07-05T04:30:00+09:00' },
      },
    }
  },
})

function postProcureRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://ae.test/api/v1/tools/procure', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/v1/tools/procure route', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
  })

  it('delivers 1-turn procurement with exact GST itemization for natural language intent', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest({
        need: 'Convert 3:30 PM New York time to Tokyo time',
        maxSpendAud: '0.50',
      }),
      testEngine,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = await response.json()
    expect(body.schemaVersion).toBe('tool.procure:v1')
    expect(body.status).toBe('delivered')
    expect(body.toolRef).toBe('operation:v1:timezone_converter')
    expect(body.price.totalAud).toBe('A$0.0020')
    expect(body.price.netAud).toBe('A$0.0018')
    expect(body.price.gstAud).toBe('A$0.0002')
    expect(body.audit.totalLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('autonomously remedies stealth provider errors with A$0.00 net charge and Rule 4 triplet', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest({
        need: 'Convert 3:30 PM New York time to Tokyo time',
        simulateProviderFailure: true,
      }),
      testEngine,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.schemaVersion).toBe('tool.procure:v1')
    expect(body.status).toBe('remedied')
    expect(body.netChargeAud).toBe('A$0.00')
    expect(body.refundedAmountAud).toBe('A$0.0020')
    expect(body.diagnostic.whatHappened).toContain('Upstream provider')
    expect(body.diagnostic.financialImpact).toContain('A$0.00 deducted')
    expect(body.diagnostic.nextStep).toContain('Autonomous buyer protection')
  })

  it('enforces deterministic IceInVein budget gates before any execution', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest({
        need: 'Run benchmark reference tool test',
        maxSpendAud: '0.05',
      }),
      testEngine,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.schemaVersion).toBe('tool.procure:v1')
    expect(body.status).toBe('refused')
    expect(body.code).toBe('budget_exceeded')
    expect(body.detail).toContain('exceeds maximum spend budget')
  })

  it('rejects unsupported content types with RFC 9457 problem details', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest('not-json', { 'content-type': 'text/plain' }),
      testEngine,
    )

    expect(response.status).toBe(415)
    const body = await response.json()
    expect(body.kind).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(body.code).toBe('invalid_content_type')
  })

  it('rejects invalid JSON payloads with 400 INVALID_ARGUMENT', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest('{ invalid json', { 'content-type': 'application/json' }),
      testEngine,
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.kind).toBe('INVALID_ARGUMENT')
    expect(body.code).toBe('invalid_json')
  })

  it('rejects unknown procurement fields through the strict input contract', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))

    const response = await handleToolProcurePost(
      postProcureRequest({
        need: 'Convert 3:30 PM New York time to Tokyo time',
        maxSpendAud: '0.50',
        endpointUrl: 'https://attacker.example',
      }),
      testEngine,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
    })
  })
})
