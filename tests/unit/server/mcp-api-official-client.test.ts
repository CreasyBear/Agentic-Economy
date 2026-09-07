import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'
import { describe, expect, it, vi } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import type { CallService } from '@/modules/capability-execution/call-authority'
import {
  currentToolRef,
  handleMcpRequest,
} from './mcp-api-harness'

const callRef = 'invocation:official-client:1'

function officialClient(
  service: CallService,
  scopes: readonly string[] = ['market_tools:call'],
): Readonly<{
  client: Client
  transport: StreamableHTTPClientTransport
}> {
  const client = new Client({ name: 'ae-official-client-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('https://ae.example/mcp'), {
    requestInit: {
      headers: { authorization: 'Bearer official-client-test' },
    },
    fetch: async (input, init) => {
      const request = input instanceof Request
        ? new Request(input, init)
        : new Request(input, init)
      return await handleMcpRequest(request, {
        authenticate: async () => ({
          isAuthenticated: true,
          tokenType: 'api_key',
          id: 'key:official-client-test',
          subject: 'user_official_client_test',
          scopes: [...scopes],
        }),
        resolvePrincipal: async (projection) => ({
          ...projection,
          principalId: 'prn_00000000000040008000000000000044',
          ownerId: 'acc_00000000000040008000000000000044',
        }),
        callService: service,
      })
    },
  })
  return { client, transport }
}

async function connectOfficialClient(
  service: CallService,
  scopes?: readonly string[],
): Promise<Client> {
  const { client, transport } = officialClient(service, scopes)
  // SDK 1.30.0's emitted transport declarations disagree only on whether the
  // optional sessionId property is spelled `?: string` or `string | undefined`.
  await client.connect(transport as unknown as Parameters<Client['connect']>[0])
  return client
}

describe('MCP host adapter with the official client', () => {
  it('compiles every admitted tool contract while removing repeated schema bytes', async () => {
    const service: CallService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const client = await connectOfficialClient(service, [
      'market_tools:call',
      'market_supply:manage',
    ])
    const listed = await client.listTools()
    await client.close()

    const expectedActions = listMcpActions()
    expect(listed.tools.map(({ name }) => name)).toEqual(expectedActions.map(mcpToolName))

    for (const tool of listed.tools) {
      const action = expectedActions.find((candidate) => mcpToolName(candidate) === tool.name)
      if (action === undefined) throw new Error(`No action found for ${tool.name}.`)
      expect(tool.inputSchema).toEqual(toJsonSchemaCompat(action.schema, {
        strictUnions: true,
        pipeStrategy: 'input',
      }))
      expect(tool.outputSchema).toBeUndefined()
    }

    const byteLength = (value: unknown): number => new TextEncoder()
      .encode(JSON.stringify(value)).byteLength
    const toolsBytes = byteLength(listed.tools)
    const outputSchemaBytes = listed.tools.reduce(
      (total, tool) => total + byteLength(tool.outputSchema),
      0,
    )
    const inputSchemaBytes = listed.tools.reduce(
      (total, tool) => total + byteLength(tool.inputSchema),
      0,
    )

    const preCompactManifest = {
      toolsBytes: 221_955,
      outputSchemaBytes: 186_908,
    }
    const currentAuthenticatedToolsBaselineBytes = 45_783
    expect(toolsBytes).toBeLessThanOrEqual(Math.floor(currentAuthenticatedToolsBaselineBytes * 1.1))
    expect(toolsBytes).toBeLessThanOrEqual(Math.floor(preCompactManifest.toolsBytes * 1.2))
    expect(outputSchemaBytes).toBe(0)
    expect(inputSchemaBytes).toBeLessThanOrEqual(expectedActions.length * 800)
  })

  it('retains Call identity across a fresh client and reads the terminal structured result', async () => {
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
        normalizedInput: { company: 'Acme' },
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
          method: 'POST' as const,
          path: '/api/v1/tools/call' as const,
          input: {
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

    const invokeClient = await connectOfficialClient(service)
    await invokeClient.listTools()
    const quoted = await invokeClient.callTool({
      name: 'ae_tool_quote',
      arguments: { toolRef: currentToolRef, input: { company: 'Acme' } },
    })
    expect(quoted.structuredContent).toEqual({
      result: expect.objectContaining({
        kind: 'committed',
        quoteRef,
      }),
    })
    const called = await invokeClient.callTool({
      name: 'ae_tool_call',
      arguments: {
        quoteRef,
        idempotencyKey: 'official-client-call-1',
      },
    })
    await invokeClient.close()

    expect(called.structuredContent).toEqual({
      result: expect.objectContaining({ kind: 'pending', callRef }),
    })

    const recoveryClient = await connectOfficialClient(service)
    await recoveryClient.listTools()
    const recovered = await recoveryClient.callTool({
      name: 'ae_call_status',
      arguments: { callRef },
    })
    await recoveryClient.close()

    expect(recovered.structuredContent).toEqual({
      result: expect.objectContaining({
        kind: 'found',
        callRef,
        state: 'terminal',
        result: completed,
      }),
    })
    expect(service.callTool).toHaveBeenCalledTimes(1)
    expect(service.readCallStatus).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      principal: expect.objectContaining({
        principalId: 'prn_00000000000040008000000000000044',
      }),
    }))
  })
})
