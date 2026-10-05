import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { projectToolLatency, toolLatencyEvidenceSchema } from '@/modules/registry/tool-latency'
import { registryToolsCompareAction, registryToolsDescribeAction } from '@/modules/registry/tools.actions'
import { handleMarketToolDescribeRequest } from '@/routes/api.v1.market-tools.describe'
import { handleMcpRequest } from '@/lib/server/mcp-api'
import { TOOL_CRYPTO_TX, TOOL_TIMEZONE } from '../../helpers/tool-search-rerank-fixtures'

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolDetail: vi.fn(), readCapabilityToolSearch: vi.fn(),
}))

const now = 1_791_200_000_000
const cutoff = now - 30 * 24 * 60 * 60 * 1_000
const observed = { toolRef: TOOL_CRYPTO_TX.toolRef, latencySamplesMs: [40_000, 42_000, 38_000, 39_000, 41_000] }
const query = vi.fn()

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.test')
  query.mockReset().mockResolvedValue([observed])
  setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() })
  setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
  vi.mocked(readCapabilityToolDetail).mockImplementation(async ({ toolRef }) => {
    const tool = [TOOL_CRYPTO_TX, TOOL_TIMEZONE].find(candidate => candidate.toolRef === toolRef)
    return tool === undefined
      ? { kind: 'not_found', schemaVersion: 'registry-tools:v3', toolRef, navigation: [] }
      : { kind: 'found', schemaVersion: 'registry-tools:v3', tool }
  })
})
afterEach(() => {
  setPublicSourceTransportForTests(undefined)
  setHttpRateLimitAdmissionForTests(undefined)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Tool time to result evidence', () => {
  it('preserves legacy describe and compare shapes when latency was not requested', async () => {
    const description = await registryToolsDescribeAction.run({ data: { toolRef: TOOL_CRYPTO_TX.toolRef }, context: { caller: 'http' } })
    const comparison = await registryToolsCompareAction.run({ data: { toolRefs: [TOOL_CRYPTO_TX.toolRef, TOOL_TIMEZONE.toolRef] }, context: { caller: 'http' } })
    expect(description).not.toHaveProperty('tool.latency')
    expect(comparison).not.toHaveProperty('tools.0.latency')
    expect(comparison).not.toHaveProperty('tools.1.latency')
    expect(query).not.toHaveBeenCalled()
  })

  it('shares the completed-sample policy, excluding invalid samples and older samples beyond 48', () => {
    const samples = [-1, 0.5, Number.NaN, Infinity, ...Array.from({ length: 48 }, (_, index) => index * 1_000), 999_999]
    const result = projectToolLatency(samples)
    expect(result).toMatchObject({ kind: 'measured', sampleSize: 48, medianMs: 23_000, p95Ms: 45_000 })
    expect(result.samplesMs).toHaveLength(48)
    expect(samples).toHaveLength(53)
    expect(projectToolLatency([40_000, 42_000])).toMatchObject({ kind: 'insufficient_sample', sampleSize: 2, minimumSampleSize: 5 })
    expect(projectToolLatency([40_000, 42_000])).not.toHaveProperty('medianMs')
  })

  it('exposes the same measured evidence over HTTP and MCP with the actual 30-day query cutoff', async () => {
    const response = await handleMarketToolDescribeRequest(new Request('https://ae.test/api/v1/market-tools/describe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolRef: TOOL_CRYPTO_TX.toolRef, includeLatency: true }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    const latency = toolLatencyEvidenceSchema.parse(body.tool.latency)
    expect(latency).toMatchObject({
      kind: 'measured', measurement: 'admitted_to_completed', sampleSize: 5,
      medianMs: 40_000, p95Ms: 42_000, window: { from: cutoff, to: now },
    })
    expect(latency.definition).toContain('not network time to first byte')
    expect(latency).not.toHaveProperty('samplesMs')
    expect(getFunctionName(query.mock.calls[0]![0])).toBe('marketListingEvidence:read')
    expect(query.mock.calls[0]![1]).toEqual({ toolRefs: [TOOL_CRYPTO_TX.toolRef], since: cutoff })

    const mcpResponse = await handleMcpRequest(new Request('https://ae.test/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'ae_registry_tools_describe', arguments: { toolRef: TOOL_CRYPTO_TX.toolRef, includeLatency: true },
      } }),
    }))
    expect(mcpResponse.status).toBe(200)
    const mcpBody = await mcpResponse.json()
    expect(mcpBody.result.structuredContent.result.tool.latency).toEqual(latency)
  })

  it('batches compare once and joins by exact Tool identity rather than array order', async () => {
    query.mockResolvedValue([
      { toolRef: TOOL_TIMEZONE.toolRef, latencySamplesMs: [] },
      observed,
      { toolRef: 'unrelated', latencySamplesMs: [1, 1, 1, 1, 1] },
    ])
    const result = await registryToolsCompareAction.run({ data: { toolRefs: [TOOL_CRYPTO_TX.toolRef, TOOL_TIMEZONE.toolRef], includeLatency: true }, context: { caller: 'http' } })
    expect(result).toMatchObject({ kind: 'ok', tools: [
      { toolRef: TOOL_CRYPTO_TX.toolRef, latency: { kind: 'measured', medianMs: 40_000 } },
      { toolRef: TOOL_TIMEZONE.toolRef, latency: { kind: 'insufficient_sample', sampleSize: 0 } },
    ] })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]![1]).toEqual({ toolRefs: [TOOL_CRYPTO_TX.toolRef, TOOL_TIMEZONE.toolRef], since: cutoff })
  })

  it.each(['outage', 'malformed', 'missing', 'duplicate'])('preserves the Tool and omits unknown evidence on %s', async failure => {
    if (failure === 'outage') query.mockRejectedValue(new Error('Evidence source offline'))
    else query.mockResolvedValue(failure === 'malformed' ? { secret: 'invalid' } : failure === 'missing' ? [] : [observed, observed])
    const result = await registryToolsDescribeAction.run({ data: { toolRef: TOOL_CRYPTO_TX.toolRef, includeLatency: true }, context: { caller: 'http' } })
    expect(result).toMatchObject({ kind: 'found', tool: { toolRef: TOOL_CRYPTO_TX.toolRef } })
    expect(result).not.toHaveProperty('tool.latency')
    expect(JSON.stringify(result)).not.toContain('Evidence source offline')
  })

  it('does not read or invent evidence for an unresolved Tool', async () => {
    const result = await registryToolsDescribeAction.run({ data: { toolRef: `operation:v1:${'f'.repeat(64)}` }, context: { caller: 'http' } })
    expect(result.kind).toBe('not_found')
    expect(query).not.toHaveBeenCalled()
  })
})
