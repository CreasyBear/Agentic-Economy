// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { supplyEndpointConfigFromPrepared } from '@/components/ae/supply/supply-endpoint-config-readback'
import type { PreparedPublicationMaterial } from '@/modules/capability-supply/public'

import { preparedPublication } from './supply-funnel-harness'

describe('supplier endpoint config readback', () => {
  it('restores every editable source kind from admitted non-secret material', () => {
    const openApi = supplyEndpointConfigFromPrepared({
      ...preparedPublication,
      sourceDescriptorJson: JSON.stringify({ openapi: '3.1.0' }),
      sourceSelector: { path: '/quote', method: 'post' },
      binding: {
        ...preparedPublication.binding,
        adapter: {
          ...preparedPublication.binding.adapter,
          config: {
            method: 'POST',
            requestTimeoutMs: 5_000,
            fixedQuery: [{ parameter: 'locale', value: 'en-AU' }],
          },
        },
      },
    })
    expect(openApi).toMatchObject({
      sourceKind: 'openapi_http',
      operation: { path: '/quote', method: 'post' },
      fixedQuery: [{ parameter: 'locale', value: 'en-AU' }],
      requestTimeoutMs: 5_000,
    })

    const mcp = supplyEndpointConfigFromPrepared(sourceMaterial({
      sourceKind: 'mcp',
      sourceSelector: { toolName: 'quote', protocolVersion: '2025-06-18' },
      sourceDescriptorJson: JSON.stringify({
        serverUrl: 'https://provider.example/mcp',
        tool: { name: 'quote', inputSchema: {}, outputSchema: {} },
      }),
      adapterId: 'mcp-jsonrpc:v1',
    }))
    expect(mcp).toMatchObject({
      sourceKind: 'mcp',
      serverUrl: 'https://provider.example/mcp',
      protocolVersion: '2025-06-18',
    })

    const agentPlugin = supplyEndpointConfigFromPrepared(sourceMaterial({
      sourceKind: 'agent_plugin_mcp',
      sourceSelector: {
        serverName: 'primary',
        toolName: 'quote',
        protocolVersion: '2025-06-18',
      },
      sourceDescriptorJson: JSON.stringify({
        manifest: {
          name: 'Quote tools',
          mcpServers: {
            primary: { type: 'http', url: 'https://provider.example/mcp' },
          },
        },
        serverName: 'primary',
        tool: { name: 'quote', inputSchema: {}, outputSchema: {} },
      }),
      adapterId: 'mcp-jsonrpc:v1',
    }))
    expect(agentPlugin).toMatchObject({
      sourceKind: 'agent_plugin_mcp',
      serverName: 'primary',
      protocolVersion: '2025-06-18',
    })

    const x402 = supplyEndpointConfigFromPrepared(sourceMaterial({
      sourceKind: 'x402',
      sourceSelector: { resourceUrl: 'https://provider.example/paid' },
      sourceDescriptorJson: JSON.stringify({
        resourceUrl: 'https://provider.example/paid',
      }),
      adapterId: 'x402-fetch:v2',
    }))
    expect(x402).toMatchObject({
      sourceKind: 'x402',
      requestTimeoutMs: 5_000,
    })
  })

  it('fails closed when no editable admitted material is available', () => {
    expect(supplyEndpointConfigFromPrepared(undefined)).toBeUndefined()
    expect(supplyEndpointConfigFromPrepared({
      ...preparedPublication,
      sourceKind: 'ae_envelope',
    })).toBeUndefined()
    expect(supplyEndpointConfigFromPrepared({
      ...preparedPublication,
      sourceDescriptorJson: '{',
    })).toBeUndefined()
    expect(supplyEndpointConfigFromPrepared({
      ...preparedPublication,
      binding: {
        ...preparedPublication.binding,
        adapter: { ...preparedPublication.binding.adapter, config: null },
      },
    })).toBeUndefined()
  })
})

function sourceMaterial(input: Readonly<{
  sourceKind: PreparedPublicationMaterial['sourceKind']
  sourceSelector: PreparedPublicationMaterial['sourceSelector']
  sourceDescriptorJson: string
  adapterId: string
}>): PreparedPublicationMaterial {
  return {
    ...preparedPublication,
    sourceKind: input.sourceKind,
    sourceSelector: input.sourceSelector,
    sourceDescriptorJson: input.sourceDescriptorJson,
    binding: {
      ...preparedPublication.binding,
      adapter: {
        adapterId: input.adapterId,
        config: { requestTimeoutMs: 5_000 },
      },
    },
  }
}
