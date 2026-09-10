import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'

import { dereferenceOpenApiSchema } from './internal/schema-deref'
import { resolveOpenApiCredential } from './internal/openapi-import/credentials'
import { resolveOpenApiRecord } from './internal/openapi-import/document'
import {
  analyzeOpenApiOperation,
  defaultOpenApiParameterExclusions,
} from './internal/openapi-import/operation'
import {
  validateOpenApiDocument,
  type ValidOpenApiDocument,
} from './internal/openapi-import/validation'
import {
  inspectSource,
  validHttpsUrl,
  type CapabilityPublicationImportRefusal,
} from './internal/publication-importer-types'
import {
  inspectX402SellerEndpoint,
  type X402SellerEndpointInspection,
} from './internal/x402-seller-endpoint-inspector'

export type SupplySourceInput =
  | Readonly<{
      kind: 'openapi'
      definitionUrl: string
      environment: 'sandbox' | 'production'
    }>
  | Readonly<{
      kind: 'mcp'
      serverUrl?: string | undefined
      registryName?: string | undefined
      remoteRef?: string | undefined
      environment: 'sandbox' | 'production'
    }>
  | Readonly<{
      kind: 'agent_plugin'
      pluginJson: Readonly<Record<string, JsonValue>>
      mcpJson: Readonly<Record<string, JsonValue>>
      remoteRef?: string | undefined
      environment: 'sandbox' | 'production'
    }>
  | Readonly<{
      kind: 'x402'
      resourceUrl: string
      method: 'GET' | 'POST'
      environment: 'sandbox' | 'production'
    }>

export type SourceAuthenticationRequirement =
  | Readonly<{ kind: 'public' }>
  | Readonly<{ kind: 'api_key'; location: 'header' | 'query'; name: string }>
  | Readonly<{ kind: 'http_bearer' }>
  | Readonly<{ kind: 'mcp_oauth' }>
  | Readonly<{ kind: 'x402_wallet' }>
  | Readonly<{ kind: 'unsupported' }>

export type SupplyToolCandidate = Readonly<{
  candidateRef: string
  sourceSelector:
    | Readonly<{ serverUrl: string; path: string; method: string }>
    | Readonly<{ serverUrl: string; toolName: string; protocolVersion: string }>
    | Readonly<{ serverName: string; serverUrl: string; toolName: string; protocolVersion: string }>
    | Readonly<{ resourceUrl: string; method: 'GET' | 'POST' }>
  title: string
  description: string
  inputSchema?: Readonly<Record<string, JsonValue>> | undefined
  outputSchema?: Readonly<Record<string, JsonValue>> | undefined
  authentication: SourceAuthenticationRequirement
  validationExampleAvailable: boolean
  x402?: Readonly<{
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
  }> | undefined
  disposition:
    | Readonly<{ kind: 'supported' }>
    | Readonly<{ kind: 'unsupported'; reason: CapabilityPublicationImportRefusal }>
}>

export type SupplySourcePreview =
  | Readonly<{
      kind: 'ready'
      sourceDigest: string
      sourceRevision: string
      provenance: Readonly<{
        sourceKind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402'
        sourceUrl: string
        authority: 'unverified_public' | 'verified_registry' | 'observed_external'
      }>
      authentication: readonly SourceAuthenticationRequirement[]
      candidates: readonly SupplyToolCandidate[]
    }>
  | Readonly<{
      kind: 'remote_selection_required'
      sourceKind: 'mcp' | 'agent_plugin'
      sourceDigest: string
      sourceRevision: string
      registryName?: string | undefined
      remotes: readonly SupplyMcpRemote[]
    }>
  | Readonly<{
      kind: 'action_required'
      requiredAction: Readonly<{
        action: 'supply.source.preview'
        blockedCapabilities: readonly ['supply.publish']
        cta: string | null
        ctaLabel: string
        description: string
        iconUrl: null
        status: 'required'
        title: string
      }>
    }>

export type SupplyMcpRemote = Readonly<{
  remoteRef: string
  name: string
  serverUrl: string
}>

export type SupplySourcePreviewDependencies = Readonly<{
  loadOpenApi?: (definitionUrl: string) => Promise<ValidOpenApiDocument>
  inspectX402?: (input: Readonly<{
    endpointUrl: string
    method: 'GET' | 'POST'
    aeEnvironment: 'sandbox' | 'production'
  }>) => Promise<X402SellerEndpointInspection>
  discoverMcp?: (input: Readonly<{
    serverUrl?: string
    registryName?: string
    remoteRef?: string
    environment: 'sandbox' | 'production'
  }>) => Promise<McpSourceDiscovery>
  mcpAuthentication?: Extract<SourceAuthenticationRequirement, { kind: 'public' | 'mcp_oauth' }>
}>

export type McpSourceDiscovery =
  | Readonly<{
      kind: 'ready'
      serverUrl: string
      registryName?: string
      verifiedNamespace?: boolean
      protocolVersion: string
      sourceDigest: string
      tools: readonly Readonly<{
        name: string
        title?: string
        description?: string
        inputSchema: Readonly<Record<string, JsonValue>>
        outputSchema?: Readonly<Record<string, JsonValue>>
      }>[]
    }>
  | Readonly<{
      kind: 'authentication_required'
      authenticationUrl: string
      serverUrl: string
    }>
  | Readonly<{
      kind: 'remote_selection_required'
      registryName: string
      sourceDigest: string
      sourceRevision: string
      remotes: readonly SupplyMcpRemote[]
    }>
  | Readonly<{
      kind: 'refused'
      reason: string
    }>

const transportJsonObjectSchema = z.record(z.string(), z.unknown()) as z.ZodType<Readonly<Record<string, JsonValue>>>

const supplySourceTransportSchema = z.strictObject({
  kind: z.enum(['openapi', 'mcp', 'agent_plugin', 'x402']),
  definitionUrl: z.string().url().max(2_048).optional(),
  serverUrl: z.string().url().max(2_048).optional(),
  registryName: z.string().trim().min(1).max(255).optional(),
  remoteRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
  pluginJson: transportJsonObjectSchema.optional(),
  mcpJson: transportJsonObjectSchema.optional(),
  resourceUrl: z.string().url().max(2_048).optional(),
  method: z.enum(['GET', 'POST']).optional(),
  environment: z.enum(['sandbox', 'production']),
}).superRefine((value, context) => {
  const present = (field: keyof typeof value): boolean => value[field] !== undefined
  const requireOnly = (
    required: readonly (keyof typeof value)[],
    forbidden: readonly (keyof typeof value)[],
  ): void => {
    for (const field of required) {
      if (!present(field)) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} is required for ${value.kind}.` })
      }
    }
    for (const field of forbidden) {
      if (present(field)) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} is not accepted for ${value.kind}.` })
      }
    }
  }

  if (value.kind === 'openapi') {
    requireOnly(['definitionUrl'], ['serverUrl', 'registryName', 'remoteRef', 'pluginJson', 'mcpJson', 'resourceUrl', 'method'])
    return
  }
  if (value.kind === 'agent_plugin') {
    requireOnly(['pluginJson', 'mcpJson'], ['definitionUrl', 'serverUrl', 'registryName', 'resourceUrl', 'method'])
    return
  }
  if (value.kind === 'x402') {
    requireOnly(['resourceUrl', 'method'], ['definitionUrl', 'serverUrl', 'registryName', 'remoteRef', 'pluginJson', 'mcpJson'])
    return
  }
  requireOnly([], ['definitionUrl', 'pluginJson', 'mcpJson', 'resourceUrl', 'method'])
  if (present('serverUrl') === present('registryName')) {
    context.addIssue({
      code: 'custom',
      path: ['serverUrl'],
      message: 'Provide exactly one of serverUrl or registryName.',
    })
  }
  if (present('serverUrl') && present('remoteRef')) {
    context.addIssue({
      code: 'custom',
      path: ['remoteRef'],
      message: 'remoteRef is accepted only with a Registry source.',
    })
  }
})

// The official MCP SDK only advertises object-shaped tool inputs. Keep the
// transport schema object-shaped while the refinement preserves the exact
// source-specific union accepted by every action surface.
export const supplySourceInputSchema = supplySourceTransportSchema as z.ZodType<SupplySourceInput>

const authenticationSchema: z.ZodType<SourceAuthenticationRequirement> = z.union([
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({
    kind: z.literal('api_key'),
    location: z.enum(['header', 'query']),
    name: z.string(),
  }),
  z.strictObject({ kind: z.literal('http_bearer') }),
  z.strictObject({ kind: z.literal('mcp_oauth') }),
  z.strictObject({ kind: z.literal('x402_wallet') }),
  z.strictObject({ kind: z.literal('unsupported') }),
])
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)
const refusalReasonSchema = z.string() as z.ZodType<CapabilityPublicationImportRefusal>
const candidateSchema: z.ZodType<SupplyToolCandidate> = z.strictObject({
  candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  sourceSelector: z.union([
    z.strictObject({ serverUrl: z.string().url(), path: z.string(), method: z.string() }),
    z.strictObject({
      serverUrl: z.string().url(),
      toolName: z.string(),
      protocolVersion: z.string(),
    }),
    z.strictObject({
      serverName: z.string(),
      serverUrl: z.string().url(),
      toolName: z.string(),
      protocolVersion: z.string(),
    }),
    z.strictObject({ resourceUrl: z.string().url(), method: z.enum(['GET', 'POST']) }),
  ]),
  title: z.string(),
  description: z.string(),
  inputSchema: jsonObjectSchema.optional(),
  outputSchema: jsonObjectSchema.optional(),
  authentication: authenticationSchema,
  validationExampleAvailable: z.boolean(),
  x402: z.strictObject({
    scheme: z.string(),
    network: z.string(),
    amount: z.string(),
    asset: z.string(),
    payTo: z.string(),
  }).optional(),
  disposition: z.union([
    z.strictObject({ kind: z.literal('supported') }),
    z.strictObject({ kind: z.literal('unsupported'), reason: refusalReasonSchema }),
  ]),
})
export const supplySourcePreviewSchema: z.ZodType<SupplySourcePreview> = z.union([
  z.strictObject({
    kind: z.literal('ready'),
    sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    sourceRevision: z.string(),
    provenance: z.strictObject({
      sourceKind: z.enum(['openapi', 'mcp', 'agent_plugin', 'x402']),
      sourceUrl: z.string().url(),
      authority: z.enum(['unverified_public', 'verified_registry', 'observed_external']),
    }),
    authentication: z.array(authenticationSchema),
    candidates: z.array(candidateSchema).max(128),
  }),
  z.strictObject({
    kind: z.literal('remote_selection_required'),
    sourceKind: z.enum(['mcp', 'agent_plugin']),
    sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    sourceRevision: z.string(),
    registryName: z.string().optional(),
    remotes: z.array(z.strictObject({
      remoteRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      name: z.string().trim().min(1),
      serverUrl: z.string().url(),
    })).min(1).max(8),
  }),
  z.strictObject({
    kind: z.literal('action_required'),
    requiredAction: z.strictObject({
      action: z.literal('supply.source.preview'),
      blockedCapabilities: z.tuple([z.literal('supply.publish')]),
      cta: z.string().max(2_048).nullable(),
      ctaLabel: z.string(),
      description: z.string(),
      iconUrl: z.null(),
      status: z.literal('required'),
      title: z.string(),
    }),
  }),
])

const OPENAPI_METHODS = [
  'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace',
] as const

export async function previewSupplySource(
  input: SupplySourceInput,
  dependencies: SupplySourcePreviewDependencies = {},
): Promise<SupplySourcePreview> {
  if (input.kind === 'agent_plugin') return await previewAgentPluginSource(input, dependencies)
  if (input.kind === 'mcp') return await previewMcpSource(input, dependencies)
  if (input.kind === 'x402') return await previewX402Source(input, dependencies)
  const definitionUrl = validHttpsUrl(input.definitionUrl)
  if (definitionUrl === undefined) return openApiCorrection('OpenAPI source unavailable')

  let loaded: unknown
  try {
    loaded = await (dependencies.loadOpenApi ?? loadPublicOpenApi)(definitionUrl)
  } catch {
    return openApiCorrection('OpenAPI source unavailable')
  }
  const bounded = inspectSource(loaded)
  if (bounded.kind === 'refused') return openApiCorrection('OpenAPI source invalid')
  const validated = await validateOpenApiDocument(loaded)
  if (validated.kind === 'refused') return openApiCorrection('OpenAPI source invalid')

  const candidates = await openApiCandidates(validated.document, bounded.digest, definitionUrl)
  const authentication = uniqueAuthentication(candidates)
  return {
    kind: 'ready',
    sourceDigest: bounded.digest,
    sourceRevision: `openapi:${bounded.digest}`,
    provenance: {
      sourceKind: 'openapi',
      sourceUrl: definitionUrl,
      authority: 'unverified_public',
    },
    authentication,
    candidates,
  }
}

async function previewAgentPluginSource(
  input: Extract<SupplySourceInput, { kind: 'agent_plugin' }>,
  dependencies: SupplySourcePreviewDependencies,
): Promise<SupplySourcePreview> {
  const authentication = dependencies.mcpAuthentication ?? { kind: 'public' as const }
  const bounded = inspectSource({ pluginJson: input.pluginJson, mcpJson: input.mcpJson })
  if (bounded.kind === 'refused') {
    return sourceCorrection(
      'Agent Plugin bundle invalid',
      'Correct plugin.json and mcp.json against Agent Plugins 1.0, then preview them again.',
    )
  }
  const { validateAgentPluginSource } = await import('./internal/agent-plugin-source')
  const validated = validateAgentPluginSource(input.pluginJson, input.mcpJson)
  if (validated.kind === 'refused') {
    return sourceCorrection(
      'Agent Plugin bundle needs attention',
      'Use matching Agent Plugins 1.0 plugin.json and mcp.json files with a remote streamable-http server and no embedded headers, then preview them again.',
    )
  }

  const remotes = validated.servers.map((server): SupplyMcpRemote => ({
    remoteRef: canonicalDigest({
      format: 'agent-plugin-mcp-remote:v1',
      name: server.name,
      transport: 'streamable-http',
      serverUrl: server.url,
    }),
    name: server.name,
    serverUrl: server.url,
  }))
  if (input.remoteRef === undefined) {
    return {
      kind: 'remote_selection_required',
      sourceKind: 'agent_plugin',
      sourceDigest: bounded.digest,
      sourceRevision: `agent-plugin-1.0:${bounded.digest}`,
      remotes,
    }
  }
  const selectedRemote = remotes.find(({ remoteRef }) => remoteRef === input.remoteRef)
  if (selectedRemote === undefined) {
    return sourceCorrection(
      'Agent Plugin server changed',
      'Select one current remote MCP server from the Agent Plugin files, then continue.',
    )
  }

  const discover = dependencies.discoverMcp
    ?? (await import('./internal/mcp-source-discovery')).discoverMcpSource
  let discovery: McpSourceDiscovery
  try {
    discovery = await discover({ serverUrl: selectedRemote.serverUrl, environment: input.environment })
  } catch {
    return sourceCorrection(
      'Agent Plugin server unavailable',
      'Make the selected MCP server available at the same public HTTPS URL, then preview the bundle again.',
    )
  }
  if (discovery.kind === 'authentication_required') {
    return sourceCorrection(
      'Connect MCP server',
      `Connect ${selectedRemote.name}, then return to continue previewing its tools.`,
      discovery.authenticationUrl,
      'Connect server',
    )
  }
  if (discovery.kind === 'remote_selection_required') {
    return sourceCorrection('Agent Plugin server changed', 'Select the current MCP server again, then continue.')
  }
  if (discovery.kind === 'refused') {
    return sourceCorrection(
      'Agent Plugin server needs attention',
      `Correct ${selectedRemote.name} at its source, then preview the bundle again.`,
    )
  }

  const sourceDigest = canonicalDigest({
    bundleDigest: bounded.digest,
    selectedRemoteRef: selectedRemote.remoteRef,
    remoteDigest: discovery.sourceDigest,
  })
  const candidates: SupplyToolCandidate[] = []
  for (const tool of discovery.tools) {
    if (candidates.length >= 128) break
    const selector = {
      serverName: selectedRemote.name,
      serverUrl: discovery.serverUrl,
      toolName: tool.name,
      protocolVersion: discovery.protocolVersion,
    }
    candidates.push({
      candidateRef: canonicalDigest({ sourceDigest, selector }),
      sourceSelector: selector,
      title: boundedText(tool.title) ?? tool.name,
      description: boundedText(tool.description) ?? tool.name,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
      authentication,
      validationExampleAvailable: false,
      disposition: tool.outputSchema === undefined
        ? { kind: 'unsupported', reason: 'schema_missing' }
        : { kind: 'supported' },
    })
  }
  return {
    kind: 'ready',
    sourceDigest,
    sourceRevision: `agent-plugin-1.0:${sourceDigest}`,
    provenance: {
      sourceKind: 'agent_plugin',
      sourceUrl: selectedRemote.serverUrl,
      authority: 'unverified_public',
    },
    authentication: [authentication],
    candidates,
  }
}

async function previewMcpSource(
  input: Extract<SupplySourceInput, { kind: 'mcp' }>,
  dependencies: SupplySourcePreviewDependencies,
): Promise<SupplySourcePreview> {
  const authentication = dependencies.mcpAuthentication ?? { kind: 'public' as const }
  let discovery: McpSourceDiscovery
  try {
    const discover = dependencies.discoverMcp
      ?? (await import('./internal/mcp-source-discovery')).discoverMcpSource
    discovery = await discover({
      ...(input.serverUrl === undefined ? {} : { serverUrl: input.serverUrl }),
      ...(input.registryName === undefined ? {} : { registryName: input.registryName }),
      ...(input.remoteRef === undefined ? {} : { remoteRef: input.remoteRef }),
      environment: input.environment,
    })
  } catch {
    return sourceCorrection(
      'MCP server unavailable',
      'Make the MCP server available at the same public HTTPS URL, then preview it again.',
    )
  }
  if (discovery.kind === 'authentication_required') {
    return sourceCorrection(
      'Connect MCP server',
      'Connect the MCP server, then return to continue previewing its tools.',
      discovery.authenticationUrl,
      'Connect server',
    )
  }
  if (discovery.kind === 'remote_selection_required') {
    return {
      kind: 'remote_selection_required',
      sourceKind: 'mcp',
      sourceDigest: discovery.sourceDigest,
      sourceRevision: discovery.sourceRevision,
      registryName: discovery.registryName,
      remotes: discovery.remotes,
    }
  }
  if (discovery.kind === 'refused') {
    return sourceCorrection(
      'MCP source needs attention',
      'Correct the MCP server at its source, then preview it again.',
    )
  }

  const candidates = discovery.tools.slice(0, 128).map((tool): SupplyToolCandidate => {
    const selector = {
      serverUrl: discovery.serverUrl,
      toolName: tool.name,
      protocolVersion: discovery.protocolVersion,
    }
    const hasOutputSchema = tool.outputSchema !== undefined
    return {
      candidateRef: canonicalDigest({ sourceDigest: discovery.sourceDigest, selector }),
      sourceSelector: selector,
      title: boundedText(tool.title) ?? tool.name,
      description: boundedText(tool.description) ?? tool.name,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
      authentication,
      validationExampleAvailable: false,
      disposition: hasOutputSchema
        ? { kind: 'supported' }
        : { kind: 'unsupported', reason: 'schema_missing' },
    }
  })
  return {
    kind: 'ready',
    sourceDigest: discovery.sourceDigest,
    sourceRevision: `mcp:${discovery.sourceDigest}`,
    provenance: {
      sourceKind: 'mcp',
      sourceUrl: discovery.serverUrl,
      authority: discovery.verifiedNamespace === true ? 'verified_registry' : 'unverified_public',
    },
    authentication: [authentication],
    candidates,
  }
}

async function previewX402Source(
  input: Extract<SupplySourceInput, { kind: 'x402' }>,
  dependencies: SupplySourcePreviewDependencies,
): Promise<SupplySourcePreview> {
  let inspection: X402SellerEndpointInspection
  try {
    inspection = await (dependencies.inspectX402 ?? inspectX402SellerEndpoint)({
      endpointUrl: input.resourceUrl,
      method: input.method,
      aeEnvironment: input.environment,
    })
  } catch {
    return sourceCorrection('x402 source unavailable', 'Make the x402 resource available at the same public HTTPS URL, then preview it again.')
  }
  if (inspection.kind === 'refused') {
    return sourceCorrection('x402 source needs attention', inspection.action)
  }

  const selection = inspection.payment.selection
  const selected = selection.kind === 'selected'
    ? inspection.payment.accepts.find(({ alternativeId }) => alternativeId === selection.alternativeId)
    : undefined
  const discovery = inspection.discovery
  const supported = selected !== undefined && discovery.kind === 'admitted'
  const refusalReason: CapabilityPublicationImportRefusal = selected === undefined
    ? 'payment_execution_unsupported'
    : discovery.kind === 'refused'
      ? discovery.reason
      : 'schema_missing'
  const selector = { resourceUrl: inspection.endpoint.url, method: input.method }
  const title = `x402 ${input.method} ${new URL(inspection.endpoint.url).hostname}`
  const candidate: SupplyToolCandidate = {
    candidateRef: canonicalDigest({ sourceDigest: inspection.digest, selector }),
    sourceSelector: selector,
    title,
    description: `Paid ${input.method} Tool discovered from the live x402 payment challenge.`,
    ...(discovery.kind === 'admitted'
      ? { inputSchema: discovery.inputSchema, outputSchema: discovery.outputSchema }
      : {}),
    authentication: { kind: 'x402_wallet' },
    validationExampleAvailable: discovery.kind === 'admitted',
    ...(selected === undefined ? {} : {
      x402: {
        scheme: selected.scheme,
        network: selected.network,
        amount: selected.amount,
        asset: selected.asset,
        payTo: selected.payTo,
      },
    }),
    disposition: supported
      ? { kind: 'supported' }
      : { kind: 'unsupported', reason: refusalReason },
  }
  return {
    kind: 'ready',
    sourceDigest: inspection.digest,
    sourceRevision: `x402:${inspection.digest}`,
    provenance: {
      sourceKind: 'x402',
      sourceUrl: inspection.endpoint.url,
      authority: 'observed_external',
    },
    authentication: [{ kind: 'x402_wallet' }],
    candidates: [candidate],
  }
}

export async function loadPublicOpenApi(definitionUrl: string): Promise<ValidOpenApiDocument> {
  const target = new URL(definitionUrl)
  const { defaultDnsResolver, isPublicHttpTarget } = await import('@/modules/network-guard/public')
  if (!await isPublicHttpTarget(target, defaultDnsResolver)) throw new Error('target_not_public')
  const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
  const response = await sendGuardedHttpRequest(new Request(target, {
    method: 'GET',
    headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  }), 262_144)
  if (!response.ok || response.status >= 300) throw new Error('source_unavailable')
  const parsed = await validateOpenApiDocument(await response.text())
  if (parsed.kind === 'refused') throw new Error(parsed.reason)
  return parsed.document
}

async function openApiCandidates(
  document: Readonly<Record<string, unknown>> & Readonly<{ paths: Readonly<Record<string, unknown>> }>,
  sourceDigest: string,
  definitionUrl: string,
): Promise<readonly SupplyToolCandidate[]> {
  const candidates: SupplyToolCandidate[] = []
  const serverUrl = openApiServerUrl(document.servers) ?? definitionUrl
  const executableServer = openApiServerUrl(document.servers) !== undefined
  for (const [path, rawPathItem] of Object.entries(document.paths)) {
    const pathItemResult = await resolveOpenApiRecord(rawPathItem, document, dereferenceOpenApiSchema)
    const pathItem = pathItemResult.kind === 'resolved' ? pathItemResult.value : undefined
    if (pathItem === undefined) continue
    for (const method of OPENAPI_METHODS) {
      const rawOperation = pathItem[method]
      if (!isRecord(rawOperation)) continue
      const operationResult = await resolveOpenApiRecord(rawOperation, document, dereferenceOpenApiSchema)
      const operation = operationResult.kind === 'resolved' ? operationResult.value : undefined
      if (operation === undefined) continue
      candidates.push(await openApiCandidate({ document, pathItem, operation, path, method, sourceDigest, serverUrl, executableServer }))
      if (candidates.length >= 128) return candidates
    }
  }
  return candidates
}

async function openApiCandidate(input: Readonly<{
  document: Readonly<Record<string, unknown>>
  pathItem: Readonly<Record<string, unknown>>
  operation: Readonly<Record<string, unknown>>
  path: string
  method: string
  sourceDigest: string
  serverUrl: string
  executableServer: boolean
}>): Promise<SupplyToolCandidate> {
  const selector = { serverUrl: input.serverUrl, path: input.path, method: input.method }
  const credential = resolveOpenApiCredential(input.document, input.operation)
  const authentication = credential.kind === 'resolved'
    ? authenticationRequirement(credential.spec)
    : { kind: 'unsupported' as const }
  const analysis = credential.kind === 'resolved' && input.executableServer
    ? await analyzeOpenApiOperation(
        input.operation,
        input.pathItem.parameters,
        input.path,
        input.method,
        defaultOpenApiParameterExclusions(credential),
        input.document,
        dereferenceOpenApiSchema,
      )
    : { kind: 'refused' as const, reason: 'transport_unsupported' as const }
  const title = boundedText(input.operation.summary)
    ?? boundedText(input.operation.operationId)
    ?? `${input.method.toUpperCase()} ${input.path}`
  const description = boundedText(input.operation.description)
    ?? boundedText(input.operation.summary)
    ?? title

  return {
    candidateRef: canonicalDigest({ sourceDigest: input.sourceDigest, selector }),
    sourceSelector: selector,
    title,
    description,
    ...(analysis.kind === 'analyzed'
      ? {
          inputSchema: analysis.analysis.inputSchema,
          outputSchema: analysis.analysis.outputContent.schema,
        }
      : {}),
    authentication,
    validationExampleAvailable: requestExampleAvailable(input.operation),
    disposition: analysis.kind === 'analyzed'
      ? { kind: 'supported' }
      : { kind: 'unsupported', reason: analysis.reason },
  }
}

function openApiServerUrl(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0]) || typeof value[0].url !== 'string') {
    return undefined
  }
  return validHttpsUrl(value[0].url)
}

function authenticationRequirement(
  credential: ReturnType<typeof resolveOpenApiCredential> extends infer Result
    ? Result extends { kind: 'resolved'; spec: infer Spec } ? Spec : never
    : never,
): SourceAuthenticationRequirement {
  if (credential.kind === 'public_upstream') return { kind: 'public' }
  if (credential.kind === 'http_bearer') return { kind: 'http_bearer' }
  return { kind: 'api_key', location: credential.location, name: credential.name }
}

function uniqueAuthentication(candidates: readonly SupplyToolCandidate[]): readonly SourceAuthenticationRequirement[] {
  const unique = new Map<string, SourceAuthenticationRequirement>()
  for (const candidate of candidates) {
    unique.set(JSON.stringify(candidate.authentication), candidate.authentication)
  }
  return [...unique.values()]
}

function requestExampleAvailable(operation: Readonly<Record<string, unknown>>): boolean {
  if (!isRecord(operation.requestBody) || !isRecord(operation.requestBody.content)) return false
  return Object.values(operation.requestBody.content).some((media) =>
    isRecord(media) && (media.example !== undefined || isRecord(media.examples)))
}

function boundedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 1_000) : undefined
}

function openApiCorrection(title: string): SupplySourcePreview {
  return sourceCorrection(
    title,
    'Make the OpenAPI document available at the same public HTTPS URL, then preview it again.',
  )
}

function sourceCorrection(
  title: string,
  description: string,
  cta: string | null = null,
  ctaLabel = 'Check source',
): SupplySourcePreview {
  return {
    kind: 'action_required',
    requiredAction: {
      action: 'supply.source.preview',
      blockedCapabilities: ['supply.publish'],
      cta,
      ctaLabel,
      description,
      iconUrl: null,
      status: 'required',
      title,
    },
  }
}
