import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { x402Client } from '@x402/core/client'
import { x402HTTPClient } from '@x402/core/http'
import type { FacilitatorClient } from '@x402/core/server'
import type { SettleResponse, SupportedResponse, VerifyResponse } from '@x402/core/types'
import { validatePaymentPayload } from '@x402/core/schemas'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'

import { discoverMcpSource } from '@/modules/capability-supply/internal/mcp-source-discovery'
import { inspectX402SellerEndpoint } from '@/modules/capability-supply/internal/x402-seller-endpoint-inspector'
import { validateOpenApiDocument } from '@/modules/capability-supply/internal/openapi-import/validation'
import { previewSupplySource } from '@/modules/capability-supply/source-preview'
import {
  createPackage5ReferenceProvider,
} from '../../../tools/release/package5-reference-provider/core'
import { createPackage5ReferenceProviderVercelHandler } from '../../../tools/release/package5-reference-provider/api/fixture'
import { package5ReferenceFixtureDefinitions } from '../../../tools/release/package5-reference-provider-fixtures'
import { package5ProviderOperationsConfigFromEnvironment } from '../../../tools/release/package5-provider-operations'

const ORIGIN = 'https://package5-provider.example'

async function deployedProvider() {
  const provider = await createPackage5ReferenceProvider({
    origin: ORIGIN,
    payTo: '0x000000000000000000000000000000000000dEaD',
    facilitator: fixtureFacilitator(),
  })
  const handler = createPackage5ReferenceProviderVercelHandler({
    origin: ORIGIN,
    loadProvider: async () => provider,
  })
  const fetch: typeof globalThis.fetch = async (resource, init) => {
    const request = new Request(resource, init)
    const incoming = new URL(request.url)
    const rewritten = new URL('/api/fixture', ORIGIN)
    rewritten.searchParams.set('fixturePath', incoming.pathname)
    for (const [name, value] of incoming.searchParams) rewritten.searchParams.append(name, value)
    return await handler.fetch(new Request(rewritten, request))
  }
  return { fetch }
}

function fixtureFacilitator(): FacilitatorClient {
  return {
    getSupported: async (): Promise<SupportedResponse> => ({
      kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:84532' }],
      extensions: ['bazaar'],
      signers: { 'eip155:84532': ['fixture-facilitator'] },
    }),
    verify: async (payload): Promise<VerifyResponse> => {
      validatePaymentPayload(payload)
      const authorization = payload.payload.authorization as Record<string, unknown>
      return typeof authorization.from === 'string'
        ? { isValid: true, payer: authorization.from }
        : { isValid: false, invalidReason: 'fixture_payer_missing' }
    },
    settle: async (payload): Promise<SettleResponse> => {
      validatePaymentPayload(payload)
      const authorization = payload.payload.authorization as Record<string, unknown>
      return {
        success: true,
        payer: String(authorization.from),
        transaction: '0xfixture-settlement',
        amount: payload.accepted.amount,
        network: 'eip155:84532',
      }
    },
  }
}

describe('Package 5 reference Provider fixture', () => {
  it('is admitted through AE source preview for all four supported source families', async () => {
    const provider = await deployedProvider()
    const definitions = package5ReferenceFixtureDefinitions(ORIGIN)
    const loadOpenApi = async (definitionUrl: string) => {
      const response = await provider.fetch(new Request(definitionUrl))
      const parsed = await validateOpenApiDocument(await response.text())
      if (parsed.kind === 'refused') throw new Error(parsed.reason)
      return parsed.document
    }
    const discoverMcp = async (input: Parameters<typeof discoverMcpSource>[0]) => await discoverMcpSource(input, {
      isPublicTarget: async () => true,
      send: provider.fetch,
    })
    const inspectX402 = async (input: Parameters<typeof inspectX402SellerEndpoint>[0]) => await inspectX402SellerEndpoint(input, {
      validatePublicTarget: async () => true,
      send: provider.fetch,
      now: () => 1_700_000_000_000,
    })

    const previews = []
    for (const definition of definitions) {
      previews.push(await previewSupplySource(definition.source, { loadOpenApi, discoverMcp, inspectX402 }))
    }

    expect(previews.map((preview) => preview.kind)).toEqual(['ready', 'ready', 'ready', 'ready'])
    expect(previews.map((preview) => preview.kind === 'ready'
      ? preview.candidates.find((candidate) => definitionMatches(preview.provenance.sourceKind, candidate.sourceSelector))?.disposition.kind
      : undefined)).toEqual(['supported', 'supported', 'supported', 'supported'])

    const executed = await provider.fetch(new Request(`${ORIGIN}/openapi/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'openapi-release-proof' }),
    }))
    expect(await executed.json()).toEqual({
      sourceKind: 'openapi',
      value: 'openapi-release-proof',
      provider: 'package5-reference-provider',
    })
  })

  it('executes both MCP Operations through the official MCP client', async () => {
    const provider = await deployedProvider()
    const client = new Client({ name: 'package5-release-proof', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), { fetch: provider.fetch })
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    const tools = await client.listTools()
    const directResult = await client.callTool({
      name: 'package5_mcp_execute',
      arguments: { value: 'release-proof' },
    })
    const pluginResult = await client.callTool({
      name: 'package5_agent_plugin_execute',
      arguments: { value: 'plugin-release-proof' },
    })
    await client.close()

    expect(tools.tools.map(({ name }) => name)).toEqual([
      'package5_mcp_execute',
      'package5_agent_plugin_execute',
    ])
    expect(tools.tools.every(({ inputSchema, outputSchema }) => inputSchema.type === 'object' && outputSchema?.type === 'object')).toBe(true)
    expect(directResult.structuredContent).toEqual({
      sourceKind: 'mcp',
      value: 'release-proof',
      provider: 'package5-reference-provider',
    })
    expect(pluginResult.structuredContent).toEqual({
      sourceKind: 'agent_plugin',
      value: 'plugin-release-proof',
      provider: 'package5-reference-provider',
    })
  })

  it('supplies the exact four inputs consumed by the Package 5 release harness', () => {
    const definitions = package5ReferenceFixtureDefinitions(ORIGIN)
    const byKind = Object.fromEntries(definitions.map((definition) => [definition.kind, definition]))
    const config = package5ProviderOperationsConfigFromEnvironment({
      AE_PACKAGE5_BASE_URL: 'https://staging.agentic-economy.example',
      AE_PACKAGE5_EXPECTED_SOURCE_REVISION: 'a'.repeat(40),
      AE_PACKAGE5_PROVIDER_API_KEY: 'provider-release-credential',
      AE_PACKAGE5_BUYER_API_KEY: 'buyer-release-credential',
      AE_PACKAGE5_BUSINESS_REF: 'business:package5-release',
      AE_PACKAGE5_ENVIRONMENT: 'sandbox',
      AE_PACKAGE5_OPENAPI_FIXTURE_JSON: JSON.stringify(byKind.openapi),
      AE_PACKAGE5_MCP_FIXTURE_JSON: JSON.stringify(byKind.mcp),
      AE_PACKAGE5_AGENT_PLUGIN_FIXTURE_JSON: JSON.stringify(byKind.agent_plugin),
      AE_PACKAGE5_X402_FIXTURE_JSON: JSON.stringify(byKind.x402),
    })

    expect(config.fixtures.map(({ kind }) => kind)).toEqual(['openapi', 'mcp', 'agent_plugin', 'x402'])
  })

  it('executes the x402 Operation through the official client payment flow', async () => {
    const provider = await deployedProvider()
    const core = new x402Client()
    registerExactEvmScheme(core, {
      signer: privateKeyToAccount(`0x${'11'.repeat(32)}`),
      networks: ['eip155:84532'],
    })
    const client = new x402HTTPClient(core)
    const request = () => new Request(`${ORIGIN}/x402/execute`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'paid-release-proof' }),
    })
    const unpaid = await client.processResponse(await provider.fetch(request()))
    if (unpaid.paymentStatus !== 'payment_required' || unpaid.header === undefined || !('accepts' in unpaid.header)) {
      throw new Error('fixture_payment_challenge_missing')
    }
    const payload = await client.createPaymentPayload(unpaid.header)
    const paidRequest = request()
    for (const [name, value] of Object.entries(client.encodePaymentSignatureHeader(payload))) {
      paidRequest.headers.set(name, value)
    }
    const paid = await client.processResponse(await provider.fetch(paidRequest))

    expect(paid.paymentStatus).toBe('settled')
    expect(paid.body).toEqual({
      sourceKind: 'x402',
      value: 'paid-release-proof',
      provider: 'package5-reference-provider',
    })
  })

  it('routes every public fixture document through the Vercel fetch adapter', async () => {
    const provider = await deployedProvider()
    const paths = [
      '/health',
      '/release-fixtures',
      '/openapi.json',
      '/agent-plugin/plugin.json',
      '/agent-plugin/mcp.json',
    ]

    const responses = await Promise.all(paths.map(async (path) => await provider.fetch(`${ORIGIN}${path}`)))

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200])
    expect(await responses[3]!.json()).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'package5-reference-provider',
    })
    expect(await responses[4]!.json()).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    })
  })
})

function definitionMatches(sourceKind: string, selector: Record<string, unknown>): boolean {
  if (sourceKind === 'openapi') return selector.path === '/openapi/execute'
  if (sourceKind === 'mcp') return selector.toolName === 'package5_mcp_execute'
  if (sourceKind === 'agent_plugin') return selector.toolName === 'package5_agent_plugin_execute'
  return selector.resourceUrl === `${ORIGIN}/x402/execute`
}
