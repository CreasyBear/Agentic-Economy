import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { x402ResourceServer, HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/server'
import { x402HTTPResourceServer } from '@x402/core/http'
import { registerExactEvmScheme } from '@x402/evm/exact/server'
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar'
import { z } from 'zod'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { SupplySourceInput } from '../../src/modules/capability-supply/source-preview'

const BASE_SEPOLIA_NETWORK = 'eip155:84532' as const
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
const X402_AMOUNT = '1000' as const
const X402_ROUTE = 'POST /x402/execute' as const
const MAX_REQUEST_BYTES = 1_048_576

const inputSchema = {
  type: 'object',
  properties: { value: { type: 'string', minLength: 1, maxLength: 200 } },
  required: ['value'],
  additionalProperties: false,
} as const

const outputSchema = {
  type: 'object',
  properties: {
    sourceKind: { type: 'string', enum: ['openapi', 'mcp', 'agent_plugin', 'x402'] },
    value: { type: 'string' },
    provider: { type: 'string', const: 'package5-reference-provider' },
  },
  required: ['sourceKind', 'value', 'provider'],
  additionalProperties: false,
} as const

const input = z.strictObject({ value: z.string().trim().min(1).max(200) })
const toolOutput = z.strictObject({
  sourceKind: z.enum(['mcp', 'agent_plugin']),
  value: z.string(),
  provider: z.literal('package5-reference-provider'),
})

type SourceKind = 'openapi' | 'mcp' | 'agent_plugin' | 'x402'

export type Package5ReferenceFixtureDefinition = Readonly<{
  kind: SourceKind
  source: SupplySourceInput
  candidateMatch:
    | Readonly<{ path: '/openapi/execute'; method: 'post' }>
    | Readonly<{ toolName: 'package5_mcp_execute' | 'package5_agent_plugin_execute' }>
    | Readonly<{ resourceUrl: string; method: 'POST' }>
  presentation: Readonly<{ name: string; description: string; category: 'release-proof' }>
  consequences: Readonly<{ effects: readonly []; dataUse: readonly []; evidence: readonly [] }>
  pricing: Readonly<{ kind: 'free' | 'source_x402' }>
  validationInput: Readonly<{ value: string }>
  invokeInput: Readonly<{ value: string }>
}>

export type Package5ReferenceProvider = Readonly<{
  fetch: typeof globalThis.fetch
}>

export type Package5ReferenceProviderOptions = Readonly<{
  origin: string
  payTo: string
  facilitator?: FacilitatorClient
  facilitatorUrl?: string
}>

export function package5ReferenceFixtureDefinitions(originValue: string): readonly Package5ReferenceFixtureDefinition[] {
  const origin = publicOrigin(originValue)
  const mcpUrl = `${origin}/mcp`
  const remoteRef = canonicalDigest({
    format: 'agent-plugin-mcp-remote:v1',
    name: 'package5-reference-provider',
    transport: 'streamable-http',
    serverUrl: mcpUrl,
  })
  const common = (kind: SourceKind) => ({
    kind,
    presentation: {
      name: `Package 5 ${kind.replace('_', ' ')} reference Operation`,
      description: `Deterministic ${kind.replace('_', ' ')} Provider Operation for Package 5 release proof.`,
      category: 'release-proof' as const,
    },
    consequences: { effects: [], dataUse: [], evidence: [] } as const,
    pricing: { kind: kind === 'x402' ? 'source_x402' as const : 'free' as const },
    validationInput: { value: `${kind}-validation` },
    invokeInput: { value: `${kind}-invocation` },
  })
  return [
    {
      ...common('openapi'),
      source: { kind: 'openapi', definitionUrl: `${origin}/openapi.json`, environment: 'sandbox' },
      candidateMatch: { path: '/openapi/execute', method: 'post' },
    },
    {
      ...common('mcp'),
      source: { kind: 'mcp', serverUrl: mcpUrl, environment: 'sandbox' },
      candidateMatch: { toolName: 'package5_mcp_execute' },
    },
    {
      ...common('agent_plugin'),
      source: {
        kind: 'agent_plugin',
        pluginJson: pluginDocument(),
        mcpJson: mcpDocument(mcpUrl),
        remoteRef,
        environment: 'sandbox',
      },
      candidateMatch: { toolName: 'package5_agent_plugin_execute' },
    },
    {
      ...common('x402'),
      source: { kind: 'x402', resourceUrl: `${origin}/x402/execute`, method: 'POST', environment: 'sandbox' },
      candidateMatch: { resourceUrl: `${origin}/x402/execute`, method: 'POST' },
    },
  ]
}

export async function createPackage5ReferenceProvider(
  options: Package5ReferenceProviderOptions,
): Promise<Package5ReferenceProvider> {
  const origin = publicOrigin(options.origin)
  if (!/^0x[0-9a-f]{40}$/iu.test(options.payTo)) throw new Error('AE_PACKAGE5_FIXTURE_X402_PAY_TO must be an EVM address')
  const facilitator = options.facilitator ?? new HTTPFacilitatorClient({
    url: publicHttpsUrl(options.facilitatorUrl, 'AE_PACKAGE5_FIXTURE_X402_FACILITATOR_URL'),
  })
  const resourceServer = registerExactEvmScheme(new x402ResourceServer(facilitator), {
    networks: [BASE_SEPOLIA_NETWORK],
  })
  resourceServer.registerExtension(bazaarResourceServerExtension)
  const httpResourceServer = new x402HTTPResourceServer(resourceServer, {
    [X402_ROUTE]: {
      accepts: {
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK,
        payTo: options.payTo,
        price: {
          amount: X402_AMOUNT,
          asset: BASE_SEPOLIA_USDC,
          extra: { name: 'USDC', version: '2' },
        },
        maxTimeoutSeconds: 60,
      },
      description: 'Deterministic x402 Operation for Package 5 release proof.',
      mimeType: 'application/json',
      serviceName: 'package5-reference-provider',
      extensions: declareDiscoveryExtension({
        bodyType: 'json',
        input: { value: 'x402-validation' },
        inputSchema,
        output: {
          example: providerOutput('x402', 'x402-validation'),
          schema: outputSchema,
        },
      }),
    },
  })
  await httpResourceServer.initialize()

  return {
    fetch: async (resource, init) => {
      const request = new Request(resource, init)
      const url = new URL(request.url)
      if (url.origin !== origin) return json(421, { code: 'fixture_origin_mismatch' })
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(200, { status: 'ok', provider: 'package5-reference-provider' })
      }
      if (request.method === 'GET' && url.pathname === '/release-fixtures') {
        return json(200, { fixtures: package5ReferenceFixtureDefinitions(origin) })
      }
      if (request.method === 'GET' && url.pathname === '/openapi.json') {
        return json(200, openApiDocument(origin))
      }
      if (request.method === 'GET' && url.pathname === '/agent-plugin/plugin.json') {
        return json(200, pluginDocument())
      }
      if (request.method === 'GET' && url.pathname === '/agent-plugin/mcp.json') {
        return json(200, mcpDocument(`${origin}/mcp`))
      }
      if (url.pathname === '/mcp') return await handleMcp(request)
      if (request.method === 'POST' && url.pathname === '/openapi/execute') {
        return executeJson(await request.json().catch(() => undefined), 'openapi')
      }
      if (request.method === 'POST' && url.pathname === '/x402/execute') {
        return await handleX402(httpResourceServer, request)
      }
      return json(404, { code: 'fixture_not_found' })
    },
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'package5-reference-provider', version: '1.0.0' })
  const register = (name: 'package5_mcp_execute' | 'package5_agent_plugin_execute', sourceKind: 'mcp' | 'agent_plugin') => {
    server.registerTool(name, {
      title: sourceKind === 'mcp' ? 'Package 5 MCP Operation' : 'Package 5 Agent Plugin Operation',
      description: `Deterministic ${sourceKind.replace('_', ' ')} Operation for Package 5 release proof.`,
      inputSchema: { value: z.string().trim().min(1).max(200) },
      outputSchema: toolOutput.shape,
    }, async ({ value }) => {
      const structuredContent = toolOutput.parse(providerOutput(sourceKind, value))
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent,
      }
    })
  }
  register('package5_mcp_execute', 'mcp')
  register('package5_agent_plugin_execute', 'agent_plugin')
  return server
}

async function handleMcp(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  const server = createMcpServer()
  await server.connect(transport)
  return await transport.handleRequest(request)
}

async function handleX402(
  server: x402HTTPResourceServer,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url)
  const adapter = {
    getHeader: (name: string): string | undefined => request.headers.get(name) ?? undefined,
    getMethod: () => request.method,
    getPath: () => url.pathname,
    getUrl: () => url.toString(),
    getAcceptHeader: () => request.headers.get('accept') ?? '',
    getUserAgent: () => request.headers.get('user-agent') ?? '',
    getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
  }
  const processed = await server.processHTTPRequest({ adapter, path: url.pathname, method: request.method })
  if (processed.type === 'payment-error') {
    return json(processed.response.status, processed.response.body ?? {}, processed.response.headers)
  }
  const body = await request.json().catch(() => undefined)
  const parsed = input.safeParse(body)
  if (!parsed.success) {
    if (processed.type === 'payment-verified') {
      await processed.cancellationDispatcher.cancel({ reason: 'handler_failed', responseStatus: 400 })
    }
    return json(400, { code: 'fixture_input_invalid' })
  }
  if (processed.type === 'no-payment-required') return json(200, providerOutput('x402', parsed.data.value))
  const settlement = await server.processSettlement(
    processed.paymentPayload,
    processed.paymentRequirements,
    processed.declaredExtensions,
    { request: { adapter, path: url.pathname, method: request.method } },
  )
  if (!settlement.success) {
    return json(settlement.response.status, settlement.response.body ?? {}, settlement.response.headers)
  }
  return json(200, providerOutput('x402', parsed.data.value), settlement.headers)
}

function providerOutput(sourceKind: SourceKind, value: string) {
  return { sourceKind, value, provider: 'package5-reference-provider' as const }
}

function openApiDocument(origin: string) {
  return {
    openapi: '3.1.0',
    info: { title: 'Package 5 reference Provider', version: '1.0.0' },
    servers: [{ url: origin }],
    paths: {
      '/openapi/execute': {
        post: {
          operationId: 'package5OpenApiExecute',
          summary: 'Package 5 OpenAPI Operation',
          description: 'Deterministic OpenAPI Operation for Package 5 release proof.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: inputSchema, example: { value: 'openapi-validation' } } },
          },
          responses: {
            '200': {
              description: 'Operation result',
              content: {
                'application/json': {
                  schema: outputSchema,
                  example: providerOutput('openapi', 'openapi-validation'),
                },
              },
            },
          },
        },
      },
    },
  }
}

function pluginDocument() {
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'package5-reference-provider',
    version: '1.0.0',
    description: 'Agent Plugins 1.0 fixture for Package 5 release proof.',
  } as const
}

function mcpDocument(mcpUrl: string) {
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      'package5-reference-provider': { type: 'streamable-http', url: mcpUrl },
    },
  } as const
}

function executeJson(value: unknown, sourceKind: 'openapi'): Response {
  const parsed = input.safeParse(value)
  return parsed.success
    ? json(200, providerOutput(sourceKind, parsed.data.value))
    : json(400, { code: 'fixture_input_invalid' })
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  })
}

function publicOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
    || url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0) {
    throw new Error('AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN must be a credential-free HTTPS origin')
  }
  return url.origin
}

function publicHttpsUrl(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`${name} is required`)
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0 || url.hash.length > 0) {
    throw new Error(`${name} must be a credential-free HTTPS URL`)
  }
  return url.toString()
}

async function nodeRequest(request: IncomingMessage, publicOriginValue: string): Promise<Request> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += bytes.length
    if (length > MAX_REQUEST_BYTES) throw new Error('fixture_request_too_large')
    chunks.push(bytes)
  }
  const url = new URL(request.url ?? '/', publicOriginValue)
  const method = request.method ?? 'GET'
  return new Request(url, {
    method,
    headers: nodeRequestHeaders(request),
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
  })
}

function nodeRequestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  return headers
}

async function writeNodeResponse(response: ServerResponse, result: Response): Promise<void> {
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()))
  response.end(Buffer.from(await result.arrayBuffer()))
}

async function main(): Promise<void> {
  const origin = publicOrigin(process.env.AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN ?? '')
  const facilitatorUrl = process.env.AE_PACKAGE5_FIXTURE_X402_FACILITATOR_URL
  const provider = await createPackage5ReferenceProvider({
    origin,
    payTo: process.env.AE_PACKAGE5_FIXTURE_X402_PAY_TO ?? '',
    ...(facilitatorUrl === undefined ? {} : { facilitatorUrl }),
  })
  const port = Number(process.env.PORT ?? '3000')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be between 1 and 65535')
  const server = createServer((request, response) => {
    void nodeRequest(request, origin)
      .then(provider.fetch)
      .then(async (result) => await writeNodeResponse(response, result))
      .catch((error: unknown) => {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ code: error instanceof Error ? error.message : 'fixture_error' }))
      })
  })
  server.listen(port, '0.0.0.0')
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href) await main()
