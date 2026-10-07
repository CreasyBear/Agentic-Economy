import { Client as CurrentClient, StreamableHTTPClientTransport as CurrentTransport } from '@modelcontextprotocol/client'
import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import type { CallService } from '@/modules/capability-execution/call-authority'
import {
  currentToolRef,
  handleMcpRequest,
} from './mcp-api-harness'

const callRef = `operation-invocation:v1:${'b'.repeat(64)}`

type ClientMode = 'legacy' | 'auto' | 'current'
const clientModes = ['legacy', 'auto', 'current'] as const

async function connectOfficialClient(
  service: CallService,
  scopes: readonly string[] | null = ['market_tools:call'],
  mode: ClientMode = 'legacy',
): Promise<Client | CurrentClient> {
  const options = {
    ...(scopes === null ? {} : { requestInit: { headers: { authorization: 'Bearer official-client-test' } } }),
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init)
      return await handleMcpRequest(request, {
        authenticate: async () => ({
          isAuthenticated: true,
          tokenType: 'api_key',
          id: 'key:official-client-test',
          subject: 'user_official_client_test',
          scopes: scopes === null ? [] : [...scopes],
          claims: { aeEnvironment: 'sandbox' },
        }),
        resolvePrincipal: async (projection) => ({
          ...projection,
          principalId: 'prn_00000000000040008000000000000044',
          ownerId: 'acc_00000000000040008000000000000044',
        }),
        callService: service,
      })
    },
  }
  if (mode === 'legacy') {
    const client = new Client({ name: 'ae-official-client-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL('https://ae.example/mcp'), options)
    // SDK 1.30.0's emitted transport declarations disagree on optional sessionId.
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    return client
  }
  const client = new CurrentClient({ name: 'ae-official-client-test', version: '1.0.0' }, {
    versionNegotiation: { mode: mode === 'auto' ? 'auto' : { pin: MCP_LATEST_PROTOCOL_VERSION } },
  })
  await client.connect(new CurrentTransport(new URL('https://ae.example/mcp'), options))
  return client
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))

describe('MCP host adapter with the official client', () => {
  it.each(clientModes)('compiles every admitted tool contract in %s mode with exact output constraints and bounded metadata pages', async (mode) => {
    const service: CallService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const client = await connectOfficialClient(service, [
      'market_tools:call',
      'market_supply:manage',
    ], mode)
    const listed = await client.listTools({})
    // The current SDK auto-collects pages; wire-page bounds are checked by the HTTP protocol suite.
    const collectedTools = [...listed.tools]
    let page = listed
    while (page.nextCursor !== undefined) {
      page = await client.listTools({ cursor: page.nextCursor })
      collectedTools.push(...page.tools)
    }
    await client.close()

    const expectedActions = listMcpActions()
    expect(collectedTools.map(({ name }) => name)).toEqual(expectedActions.map(mcpToolName))

    for (const tool of collectedTools) {
      const action = expectedActions.find((candidate) => mcpToolName(candidate) === tool.name)
      if (action === undefined) throw new Error(`No action found for ${tool.name}.`)
      expect(tool.inputSchema).toMatchObject({ type: 'object', properties: expect.any(Object) })
      expect(tool.outputSchema).toMatchObject({ type: 'object', anyOf: expect.any(Array) })
    }

    const byteLength = (value: unknown): number => new TextEncoder()
      .encode(JSON.stringify(value)).byteLength
    const toolsBytes = byteLength(collectedTools)
    const outputSchemaBytes = collectedTools.reduce(
      (total, tool) => total + byteLength(tool.outputSchema),
      0,
    )
    const inputSchemaBytes = collectedTools.reduce(
      (total, tool) => total + byteLength(tool.inputSchema),
      0,
    )

    // Exact contracts consume context across all pages; pagination bounds each wire response.
    // Pure generation measures 346,632 bytes overall and 284,520 bytes of outputs.
    expect(toolsBytes).toBeLessThan(360_000)
    expect(outputSchemaBytes).toBeGreaterThan(0)
    expect(outputSchemaBytes).toBeLessThan(300_000)
    expect(inputSchemaBytes).toBeLessThanOrEqual(expectedActions.length * 800)
    const publicClient = await connectOfficialClient(service, null, mode)
    const publicTools = await publicClient.listTools()
    await publicClient.close()
    expect(publicTools.tools.map((tool) => tool.name)).toEqual([
      'ae_registry_tools_search',
      'ae_registry_tools_describe',
      'ae_registry_tools_compare',
    ])
    for (const tool of publicTools.tools) expect(tool.outputSchema).toMatchObject({
      type: 'object',
      anyOf: expect.any(Array),
    })
  })

  it.each(clientModes)('retains Call identity across a fresh %s client and reads the terminal structured result', async (mode) => {
    const completed = {
      kind: 'completed' as const,
      callRef,
      toolRef: currentToolRef,
      output: { providerFreshValue: 'fresh-provider-value-4d2e' },
      evidenceHash: 'evidence:official-client:1',
      usage: {
        usageRef: 'usage:official-client:1',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 2 },
        priceDigest: 'price:official-client:1',
      },
      receipt: {
        commercialModel: 'account_aud' as const,
        receiptRef: 'receipt:official-client:1',
        state: 'settled' as const,
        buyerCharge: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        serviceFee: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        totalBuyerCharge: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        providerObligation: {
          amount: { currency: 'USDC', units: '0', exponent: 6 },
          settlementMethod: 'managed_x402' as const,
          payoutEligible: false as const,
        },
        providerSettlement: {
          network: 'eip155:8453' as const,
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
          amount: { currency: 'USDC', units: '0', exponent: 6 },
        },
        priceDigest: 'price:official-client:1',
        evidenceHash: 'evidence:official-client:1',
        issuedAt: '2026-08-31T00:00:00.000Z',
      },
    }
    const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}`
    const service: CallService = {
      quoteTool: vi.fn(async () => ({
        kind: 'committed' as const,
        quoteRef,
        toolRef: currentToolRef,
        toolVersion: 1,
        expiresAt: Date.now() + 60_000,

        price: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        account: {
          accountRef: 'acc_00000000000040008000000000000044',
          available: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        },
        budget: {
          principalRef: 'prn_00000000000040008000000000000044',
          maximumPerCall: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
        },
        policyRefs: ['commercial-policy:test'],
        evidenceDigest: 'sha256:inspection',
        continuation: {
          action: 'tool.call' as const,
          args: {
            quoteRef,
            idempotencyKey: 'official-client-call-1',
          },
        },
      })),
      callTool: vi.fn(async () => ({
        kind: 'pending' as const,
        callRef,
        toolRef: currentToolRef,
        retryAfterMs: 1_000,
      })),
      readCallStatus: vi.fn(async () => ({
        kind: 'found' as const,
        version: 1,
        callRef,
        toolRef: currentToolRef,
        state: 'terminal' as const,
        evidenceHash: completed.evidenceHash,
        usage: completed.usage,
        result: completed,
      })),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }

    const invokeClient = await connectOfficialClient(service, undefined, mode)
    await invokeClient.listTools()
    const quoted = await invokeClient.callTool({
      name: 'ae_tool_quote',
      arguments: { toolRef: currentToolRef, input: { company: 'Acme' } },
    })
    expect(quoted.structuredContent).toMatchObject({
      result: { kind: 'committed', quoteRef },
      next: [{ action: 'tool.call', args: { quoteRef, idempotencyKey: 'official-client-call-1' } }],
    })
    expect(quoted.content).toEqual([expect.objectContaining({ type: 'text', text: expect.any(String) })])
    expect(JSON.stringify(quoted.content)).not.toContain(quoteRef)
    const called = await invokeClient.callTool({
      name: 'ae_tool_call',
      arguments: {
        quoteRef,
        idempotencyKey: 'official-client-call-1',
      },
    })
    await invokeClient.close()

    expect(called.structuredContent).toMatchObject({
      result: { kind: 'pending', callRef },
      next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
    })
    expect(JSON.stringify(called.content)).not.toContain(callRef)

    const recoveryClient = await connectOfficialClient(service, undefined, mode)
    await recoveryClient.listTools()
    const recovered = await recoveryClient.callTool({
      name: 'ae_call_status',
      arguments: { callRef },
    })
    await recoveryClient.close()
    expect(recovered.structuredContent).toMatchObject({
      result: { kind: 'found', callRef, state: 'terminal', result: completed },
      next: [],
    })
    expect(JSON.stringify(recovered.content)).not.toContain('fresh-provider-value-4d2e')
    expect(service.callTool).toHaveBeenCalledTimes(1)
    expect(service.readCallStatus).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      principal: expect.objectContaining({
        principalId: 'prn_00000000000040008000000000000044',
      }),
    }))
  })
})
