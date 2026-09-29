import { describe, expect, it, vi } from 'vitest'

import { previewSupplySource, supplySourceInputSchema, type SupplySourcePreviewDependencies } from '@/modules/capability-supply/source-preview'

const responseSchema = {
  type: 'object',
  properties: { value: { type: 'string' } },
  required: ['value'],
  additionalProperties: false,
}

function inspection(method: 'GET' | 'POST', network = 'eip155:8453') {
  return {
    kind: 'observed' as const,
    authority: 'observed_external' as const,
    canonical: false,
    usageVerified: false,
    endpoint: { endpointId: 'endpoint:one', url: 'https://provider.example/paid' },
    backend: { backendId: 'backend:one', method, resource: 'https://provider.example/paid' },
    payment: {
      profile: network === 'eip155:84532' ? 'base-sepolia-usdc-exact' as const : 'base-usdc-exact' as const,
      accepts: [{
        alternativeId: 'alternative:one',
        scheme: 'exact',
        network,
        amount: '1000000',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        maxTimeoutSeconds: 60,
        extra: {},
        supportedByAe: true,
      }],
      selection: { kind: 'selected' as const, alternativeId: 'alternative:one' },
    },
    discovery: {
      kind: 'admitted' as const,
      method,
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: responseSchema,
    },
    probe: { status: 'payment_required' as const, httpStatus: 402, observedAt: 10 },
    digest: `sha256:${'2'.repeat(64)}`,
    paymentRequiredJson: '{}',
  }
}

describe('previewSupplySource', () => {
  it('rejects OpenAPI, MCP, and Agent Plugin supplier sources', () => {
    expect(supplySourceInputSchema.safeParse({
      kind: 'openapi',
      definitionUrl: 'https://provider.example/openapi.yaml',
      environment: 'sandbox',
    }).success).toBe(false)
    expect(supplySourceInputSchema.safeParse({
      kind: 'mcp',
      serverUrl: 'https://provider.example/mcp',
      environment: 'production',
    }).success).toBe(false)
    expect(supplySourceInputSchema.safeParse({
      kind: 'agent_plugin',
      pluginJson: {},
      mcpJson: {},
      environment: 'sandbox',
    }).success).toBe(false)
  })

  it('derives network, price, and payTo from the challenge without a caller environment', async () => {
    const inspectX402 = vi.fn().mockResolvedValue(inspection('POST', 'eip155:84532'))
    const result = await previewSupplySource({
      kind: 'x402',
      resourceUrl: 'https://provider.example/paid',
      method: 'POST',
    }, { inspectX402: inspectX402 as SupplySourcePreviewDependencies["inspectX402"] })

    expect(result).toMatchObject({
      kind: 'ready',
      provenance: { sourceKind: 'x402', authority: 'observed_external' },
      candidates: [{
        disposition: { kind: 'supported' },
        x402: {
          amount: '1000000',
          payTo: '0x0000000000000000000000000000000000000002',
          network: 'eip155:84532',
          environment: 'sandbox',
        },
      }],
    })
    expect(inspectX402).toHaveBeenCalledWith({
      endpointUrl: 'https://provider.example/paid',
      method: 'POST',
      deriveAeEnvironment: true,
    })
  })

  it('probes GET before POST and names the correction when both require payment', async () => {
    const inspectX402 = vi.fn(async ({ method }: { method: 'GET' | 'POST' }) => inspection(method))
    const result = await previewSupplySource({
      kind: 'x402',
      resourceUrl: 'https://provider.example/paid',
    }, { inspectX402: inspectX402 as SupplySourcePreviewDependencies["inspectX402"] })
    expect(inspectX402.mock.calls.map((call) => call[0].method)).toEqual(['GET', 'POST'])
    expect(result).toMatchObject({
      kind: 'action_required',
      requiredAction: { title: 'Choose the request method' },
    })
  })

  it('uses the only method that returns a payment challenge', async () => {
    const inspectX402 = vi.fn(async ({ method }: { method: 'GET' | 'POST' }) => (
      method === 'GET'
        ? { kind: 'refused', reason: 'payment_not_required', action: 'POST is the paid method.', probe: { observedAt: 1 } }
        : inspection('POST')
    ))
    const result = await previewSupplySource({
      kind: 'x402',
      resourceUrl: 'https://provider.example/paid',
    }, { inspectX402: inspectX402 as SupplySourcePreviewDependencies["inspectX402"] })
    expect(result).toMatchObject({
      kind: 'ready',
      candidates: [{ sourceSelector: { method: 'POST' }, x402: { environment: 'production' } }],
    })
  })

  it('names the inspector correction instead of a generic failure', async () => {
    const inspectX402 = vi.fn().mockResolvedValue({
      kind: 'refused',
      reason: 'payment_not_required',
      action: 'The unpaid endpoint must answer with HTTP 402 and an x402 v2 PaymentRequired challenge.',
      probe: { observedAt: 1, httpStatus: 200 },
    })
    const result = await previewSupplySource({
      kind: 'x402',
      resourceUrl: 'https://provider.example/paid',
      method: 'GET',
    }, { inspectX402: inspectX402 as SupplySourcePreviewDependencies["inspectX402"] })
    expect(result).toMatchObject({
      kind: 'action_required',
      requiredAction: {
        title: 'x402 source needs attention',
        description: 'The unpaid endpoint must answer with HTTP 402 and an x402 v2 PaymentRequired challenge.',
      },
    })
  })
})
