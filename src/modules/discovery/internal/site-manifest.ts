import { MCP_HTTP_ENDPOINT_PATH, MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  CALL_ROUTE_CONTRACT,
  CALL_ACTION_ID,
  CALL_SCOPE,
} from '@/modules/capability-execution/call-entry'
import { TOOL_QUOTE_ACTION_ID } from '@/modules/capability-execution/quote'
import {
  callResultKindValues,
  callRefusalCodeValues,
} from '@/modules/capability-execution/call-contracts'
import {
  callStatusStateValues,
  callStatusRefusalCodeValues,
} from '@/modules/capability-execution/call-recovery-contracts'
import { AGENT_ACCESS_OAUTH_SCOPES } from '@/lib/http/oauth-challenge'
import {
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
  AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
} from '@/modules/agent-access/oauth-state'
import {
  callRouteExamples,
  publicMcpToolDocs,
  type PublicMcpToolDoc,
  type PublicCallRouteExample,
} from './tool-contract'
import { PublicAgentSkillPath } from './agent-skill'
import { DiscoveryListingBoundaryLine, DiscoveryPublicSurfacePaths } from './discovery-files'
import { DeveloperDiscoveryUnsupportedCapabilities } from '../developer-discovery'
import type { DeveloperDiscoveryUnsupportedCapability } from '../developer-discovery'
import { TOOL_MARKET_ACTION_ENTRIES } from '@/modules/registry/tool-entry'
import { describeActionForAgent, findAction } from '@/modules/actions'
import { SiteDiscoveryManifestSchemaVersion } from '../site-manifest-version'
import { FUNDING_PREFLIGHT_ROUTE_CONTRACTS } from '@/modules/money/public'

const AGENT_HTTP_AUTHENTICATION = 'clerk_api_key' as const
export const SITE_DISCOVERY_SUMMARY_LINES = Object.freeze([
  'AE publishes a canonical catalogue of admitted market Tools.',
  'Paid market work goes through POST /api/v1/tools/call.',
  'Discovery supports comparison; it does not by itself prove execution, payment, or fulfilment.',
])

export const SiteDiscoveryEndpointKindValues = [
  'site_entry_point',
  'human_surface',
  'assistant_setup',
  'catalog_list',
  'catalog_search',
  'catalog_detail',
  'business_manifest',
  'discovery_file',
  'discovery_artifact',
  'tool_read',
  'quote',
  'call',
  'call_status',
  'call_cancel',
  'call_reconcile',
  'funding_preflight',
  'privacy_request',
] as const
export type SiteDiscoveryEndpointKind = (typeof SiteDiscoveryEndpointKindValues)[number]

export type SiteDiscoveryEndpointContract = Readonly<{
  kind: SiteDiscoveryEndpointKind
  label: string
  method: 'GET' | 'POST'
  /** Site-relative, exactly as it must be requested. `{slug}` is the only placeholder. */
  path: string
  url: string
  templated: boolean
  mediaType: string
  authentication: 'none' | typeof AGENT_HTTP_AUTHENTICATION
  requiredScope?: string
  requiredHeaders?: Readonly<Record<string, string>>
  actionId?: string
  contractVersion?: string
  inputJsonSchema?: unknown
  outputJsonSchema?: unknown
}>

type SiteDiscoveryOAuthContract = Readonly<{
  authorizationServerMetadataUrl: string
  protectedResourceMetadataUrl: string
  registrationUrl: string
  deviceAuthorizationUrl: string
  authorizeUrl: string
  tokenUrl: string
  grantTypes: readonly string[]
  responseTypes: readonly string[]
  tokenEndpointAuthMethods: readonly string[]
  codeChallengeMethods: readonly string[]
  scopesSupported: readonly string[]
}>

type SiteDiscoveryCallRouteContract = Readonly<{
  actionId: string
  contractVersion: string
  method: string
  path: string
  routerPath: string
  requiredHeaders: readonly string[]
  inputJsonSchema?: unknown
  outputJsonSchema?: unknown
  mcpToolName?: string
  example: PublicCallRouteExample
}>

type SiteDiscoveryCallRouteSummary = Omit<SiteDiscoveryCallRouteContract, 'example'>

type SiteDiscoveryMcpToolContract = PublicMcpToolDoc

export type SiteDiscoveryManifestContract = Readonly<{
  schemaVersion: typeof SiteDiscoveryManifestSchemaVersion
  ucpVersion: 'v1'
  name: 'Agentic Economy'
  summary: readonly string[]
  origin: string
  generatedAt: number
  endpoints: readonly SiteDiscoveryEndpointContract[]
  toolGateway: Readonly<{
    contract: typeof CALL_ROUTE_CONTRACT.call.contractVersion
    action: typeof CALL_ACTION_ID
    scope: typeof CALL_SCOPE
    routes: readonly SiteDiscoveryCallRouteContract[]
    mcpTools: readonly SiteDiscoveryMcpToolContract[]
    oauth: SiteDiscoveryOAuthContract
    http: Readonly<{
      requestMediaType: string
      responseMediaType: string
      idempotencyLocation: 'body.idempotencyKey'
      authorizationHeader: string
      problemMediaType: string
      retry: Readonly<{
        retryableField: 'retryable'
        retryAfterHeader: 'Retry-After'
        retryableRule: 'respect_retry_after_same_material'
        uncertainRule: 'status_then_recover_same_identity'
      }>
    }>
    mcp: Readonly<{
      protocolVersion: typeof MCP_LATEST_PROTOCOL_VERSION
      lifecycle: readonly ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'close']
      endpoint: string
      callTool: string
      inputFields: readonly string[]
    }>
    executionModes: Readonly<{
      gateway: Readonly<{
        action: typeof CALL_ACTION_ID
        authentication: typeof AGENT_HTTP_AUTHENTICATION
        requiresToolRef: true
      }>
      catalogOnly: Readonly<{
        action: null
        authentication: 'none'
        executable: false
      }>
    }>
    idempotency: Readonly<{
      maxLength: 200
      replay: 'same_material_returns_original_state'
      conflict: 'changed_material_refused'
      uncertain: 'recover_before_retry'
    }>
    outcomes: typeof callResultKindValues
    statusStates: typeof callStatusStateValues
    refusalCodes: typeof callRefusalCodeValues
    statusRefusalCodes: typeof callStatusRefusalCodeValues
    recovery: Readonly<{
      statusAction: string
      advancedActions: Readonly<{
        cancel: string
        reconcile: string
      }>
      retryRule: 'inspect_status_then_recover_uncertain'
    }>
  }>
  assistantSetup: Readonly<{
    instructionsUrl: string
    publicIndexUrl: string
    humanGuideUrl: string
  }>
  boundary: string
  generatedHash: string
  unsupportedCapabilities: readonly DeveloperDiscoveryUnsupportedCapability[]
}>

export const SiteDiscoveryManifestPath = '/.well-known/ucp' as const
const humanSurfaceLabels: Readonly<Record<string, string>> = {
  '/': 'Human entry point',
  '/market': 'Tool catalogue',
  '/for-agents': 'Agent setup guide',
  '/for-providers': 'Guide for Tool providers',
  '/about': 'About',
  '/privacy/remove-business': 'Listing correction or removal',
  [SiteDiscoveryManifestPath]: 'This document',
  [PublicAgentSkillPath]: 'Assistant setup instructions',
}

/**
 * The site-level entry point a cold agent reads before it knows any business.
 *
 * Every path here is projected from a list that already governs another public
 * surface — the developer discovery routes and artifacts, the llms.txt public
 * surface list, and the Call route contract. Nothing is restated by
 * hand, so an endpoint cannot drift into this document without also changing
 * the surface that owns it.
 */
export function buildSiteDiscoveryManifest(
  input: Readonly<{ canonicalBaseUrl: string; now: number }>
): SiteDiscoveryManifestContract {
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const routes = callRouteExamples().map(({ route, example }) => ({ ...route, example }))
  const mcpTools = publicMcpToolDocs()
  const callTool = mcpTools.find((tool) => tool.actionId === CALL_ACTION_ID)
  if (callTool === undefined) throw new Error('Call action MCP tool is not registered')
  const callAction = findAction(CALL_ACTION_ID)
  if (callAction === undefined) throw new Error('Call action is not registered')
  const callDescriptor = describeActionForAgent(callAction)

  const body = {
    schemaVersion: SiteDiscoveryManifestSchemaVersion,
    ucpVersion: 'v1',
    name: 'Agentic Economy',
    summary: SITE_DISCOVERY_SUMMARY_LINES,
    origin,
    endpoints: buildEndpoints(origin),
    toolGateway: {
      contract: CALL_ROUTE_CONTRACT.call.contractVersion,
      action: CALL_ACTION_ID,
      scope: CALL_SCOPE,
      routes,
      mcpTools,
      oauth: {
        authorizationServerMetadataUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.authorizationServerMetadata}`,
        protectedResourceMetadataUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.protectedResourceMetadata}`,
        registrationUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.register}`,
        deviceAuthorizationUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}`,
        authorizeUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.authorize}`,
        tokenUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.token}`,
        grantTypes: AGENT_ACCESS_OAUTH_GRANT_TYPES,
        responseTypes: AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
        tokenEndpointAuthMethods: AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
        codeChallengeMethods: AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
        scopesSupported: AGENT_ACCESS_OAUTH_SCOPES,
        errors: AGENT_ACCESS_OAUTH_ERROR_VALUES,
      },
      http: {
        requestMediaType: CALL_ROUTE_CONTRACT.media.request,
        responseMediaType: CALL_ROUTE_CONTRACT.media.response,
        idempotencyLocation: 'body.idempotencyKey',
        authorizationHeader: CALL_ROUTE_CONTRACT.headers.authorization,
        problemMediaType: CALL_ROUTE_CONTRACT.media.problem,
        retry: {
          retryableField: 'retryable',
          retryAfterHeader: 'Retry-After',
          retryableRule: 'respect_retry_after_same_material',
          uncertainRule: 'status_then_recover_same_identity',
        },
      },
      mcp: {
        endpoint: `${origin}${MCP_HTTP_ENDPOINT_PATH}`,
        callTool: callTool.name,
        protocolVersion: MCP_LATEST_PROTOCOL_VERSION,
        lifecycle: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'close'],
        inputFields: Object.keys(callDescriptor.inputJsonSchema?.properties ?? {}),
      },
      executionModes: {
        gateway: {
          action: CALL_ACTION_ID,
          authentication: AGENT_HTTP_AUTHENTICATION,
          requiresToolRef: true,
        },
        catalogOnly: {
          action: null,
          authentication: 'none',
          executable: false,
        },
      },
      idempotency: {
        maxLength: 200,
        replay: 'same_material_returns_original_state',
        conflict: 'changed_material_refused',
        uncertain: 'recover_before_retry',
      },
      outcomes: callResultKindValues,
      statusStates: callStatusStateValues,
      refusalCodes: callRefusalCodeValues,
      statusRefusalCodes: callStatusRefusalCodeValues,
      recovery: {
        statusAction: CALL_ROUTE_CONTRACT.status.actionId,
        advancedActions: {
          cancel: CALL_ROUTE_CONTRACT.cancel.actionId,
          reconcile: CALL_ROUTE_CONTRACT.reconcile.actionId,
        },
        retryRule: 'inspect_status_then_recover_uncertain',
      },
    },
    assistantSetup: {
      instructionsUrl: `${origin}${PublicAgentSkillPath}`,
      publicIndexUrl: `${origin}/llms.txt`,
      humanGuideUrl: `${origin}/for-agents`,
    },
    boundary: DiscoveryListingBoundaryLine,
    unsupportedCapabilities: DeveloperDiscoveryUnsupportedCapabilities,
  } as const

  return { ...body, generatedAt: input.now, generatedHash: schemaDescriptorDigest(body as StableHashValue) }
}

/**
 * Cold-start projection: enough to choose the next surface without embedding
 * every JSON schema twice. Exact action schemas remain available through MCP
 * tools/list, /api/discovery/schema, and Tool detail.
 */
export function projectCompactSiteDiscoveryManifest(
  manifest: SiteDiscoveryManifestContract,
) {
  const body = {
    schemaVersion: manifest.schemaVersion,
    ucpVersion: manifest.ucpVersion,
    name: manifest.name,
    summary: manifest.summary,
    origin: manifest.origin,
    endpoints: manifest.endpoints.map((endpoint) => ({
      kind: endpoint.kind,
      label: endpoint.label,
      method: endpoint.method,
      path: endpoint.path,
      url: endpoint.url,
      authentication: endpoint.authentication,
      ...(endpoint.requiredScope === undefined ? {} : { requiredScope: endpoint.requiredScope }),
      ...(endpoint.actionId === undefined ? {} : { actionId: endpoint.actionId }),
      ...(endpoint.contractVersion === undefined ? {} : { contractVersion: endpoint.contractVersion }),
    })),
    toolGateway: {
      contract: manifest.toolGateway.contract,
      action: manifest.toolGateway.action,
      scope: manifest.toolGateway.scope,
      mcp: {
        endpoint: manifest.toolGateway.mcp.endpoint,
        protocolVersion: manifest.toolGateway.mcp.protocolVersion,
        callTool: manifest.toolGateway.mcp.callTool,
        lifecycle: 'The official MCP client performs initialize and close; this endpoint is session-optional.',
      },
      access: {
        anonymous: {
          cli: 'List, search, describe, and compare current Tools without connecting.',
        },
        connected: {
          authentication: manifest.toolGateway.executionModes.gateway.authentication,
          cli: 'ae connect',
          callAction: manifest.toolGateway.executionModes.gateway.action,
        },
      },
      recovery: manifest.toolGateway.recovery,
    },
    assistantSetup: manifest.assistantSetup,
    fullContract: `${manifest.origin}${SiteDiscoveryManifestPath}?technical=1`,
    boundary: manifest.boundary,
  } as const
  return {
    ...body,
    generatedAt: manifest.generatedAt,
    generatedHash: schemaDescriptorDigest(body as StableHashValue),
  }
}

function buildEndpoints(origin: string): readonly SiteDiscoveryEndpointContract[] {
  const callRoutes: readonly SiteDiscoveryCallRouteSummary[] = callRouteExamples().map(({ route }) => route)
  const labels: Readonly<Record<string, string>> = {
    ...humanSurfaceLabels,
    ...Object.fromEntries(callRoutes.map((route) => [
      route.path,
      `${route.actionId === TOOL_QUOTE_ACTION_ID ? 'Tool' : 'Call'} ${route.actionId}`,
    ])),
    ...Object.fromEntries(TOOL_MARKET_ACTION_ENTRIES.map((entry) => [entry.pathTemplate, `Tool ${entry.relation}`])),
    ...Object.fromEntries(FUNDING_PREFLIGHT_ROUTE_CONTRACTS.map((route) => [route.path, route.label])),
  }
  const paths: readonly string[] = [
    ...callRoutes.map((route) => route.path),
    ...DiscoveryPublicSurfacePaths,
    PublicAgentSkillPath,
    ...FUNDING_PREFLIGHT_ROUTE_CONTRACTS.map((route) => route.path),
  ]

  const seen = new Set<string>()
  const endpoints: SiteDiscoveryEndpointContract[] = []
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    const access = accessFor(path, callRoutes)
    const toolRead = TOOL_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
    const toolAction = toolRead === undefined ? undefined : findAction(toolRead.actionId)
    if (toolRead !== undefined && toolAction === undefined) {
      throw new Error(`Tool market action is not registered: ${toolRead.actionId}`)
    }
    const toolDescriptor = toolAction === undefined ? undefined : describeActionForAgent(toolAction)
    const toolMetadata = toolAction === undefined || toolDescriptor === undefined
      ? undefined
      : {
        actionId: toolDescriptor.id,
        contractVersion: toolAction.invocationContract.version,
        ...(toolDescriptor.inputJsonSchema === undefined ? {} : { inputJsonSchema: toolDescriptor.inputJsonSchema }),
        ...(toolDescriptor.outputJsonSchema === undefined ? {} : { outputJsonSchema: toolDescriptor.outputJsonSchema }),
      }
    const fundingRoute = FUNDING_PREFLIGHT_ROUTE_CONTRACTS.find((route) => route.path === path)
    const fundingMetadata = fundingRoute === undefined
      ? undefined
      : {
        contractVersion: fundingRoute.contractVersion,
        ...('inputSchema' in fundingRoute
          ? { inputJsonSchema: convertSchemaToJsonSchema(fundingRoute.inputSchema) }
          : {}),
        outputJsonSchema: convertSchemaToJsonSchema(fundingRoute.outputSchema),
      }
    endpoints.push({
      kind: kindFor(path, callRoutes),
      label: labels[path] ?? path,
      method: access.method,
      path,
      url: `${origin}${path}`,
      templated: path.includes('{'),
      mediaType: mediaTypeFor(path, callRoutes),
      authentication: access.authentication,
      ...(access.requiredScope === undefined ? {} : { requiredScope: access.requiredScope }),
      ...(access.requiredHeaders === undefined ? {} : { requiredHeaders: access.requiredHeaders }),
      ...(toolMetadata === undefined ? {} : toolMetadata),
      ...(fundingMetadata === undefined ? {} : fundingMetadata),
    })
  }

  return endpoints
}

function kindFor(path: string, callRoutes: readonly SiteDiscoveryCallRouteSummary[]): SiteDiscoveryEndpointKind {
  if (FUNDING_PREFLIGHT_ROUTE_CONTRACTS.some((route) => route.path === path)) return 'funding_preflight'
  if (TOOL_MARKET_ACTION_ENTRIES.some((entry) => entry.pathTemplate === path)) return 'tool_read'
  const callRoute = callRoutes.find((route) => route.path === path)
  if (callRoute?.actionId === TOOL_QUOTE_ACTION_ID) return 'quote'
  if (callRoute?.actionId === CALL_ROUTE_CONTRACT.call.actionId) return 'call'
  if (callRoute?.actionId === CALL_ROUTE_CONTRACT.status.actionId) return 'call_status'
  if (callRoute?.actionId === CALL_ROUTE_CONTRACT.cancel.actionId) return 'call_cancel'
  if (callRoute?.actionId === CALL_ROUTE_CONTRACT.reconcile.actionId) return 'call_reconcile'
  if (path === SiteDiscoveryManifestPath) return 'site_entry_point'
  if (path === PublicAgentSkillPath) return 'assistant_setup'
  if (path === '/privacy/remove-business') return 'privacy_request'
  if (path.startsWith('/api/discovery/')) return 'discovery_artifact'
  if (path.startsWith('/api/')) return 'discovery_file'
  if (path.includes('.')) return 'discovery_file'
  return 'human_surface'
}

function accessFor(path: string, callRoutes: readonly SiteDiscoveryCallRouteSummary[]): Readonly<{
  method: 'GET' | 'POST'
  authentication: 'none' | typeof AGENT_HTTP_AUTHENTICATION
  requiredScope?: string
  requiredHeaders?: Readonly<Record<string, string>>
}> {
  const fundingRoute = FUNDING_PREFLIGHT_ROUTE_CONTRACTS.find((route) => route.path === path)
  if (fundingRoute !== undefined) {
    return {
      method: fundingRoute.method,
      authentication: 'none',
      ...(fundingRoute.method === 'POST'
        ? { requiredHeaders: { 'Content-Type': 'required' } }
        : {}),
    }
  }
  const marketTool = TOOL_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  if (marketTool !== undefined) {
    return { method: marketTool.method, authentication: marketTool.authentication }
  }
  const callRoute = callRoutes.find((route) => route.path === path)
  if (callRoute !== undefined) {
    return {
      method: callRoute.method as 'GET' | 'POST',
      authentication: AGENT_HTTP_AUTHENTICATION,
      requiredScope: CALL_SCOPE,
      requiredHeaders: Object.fromEntries(callRoute.requiredHeaders.map((header) => [header, 'required'])),
    }
  }
  return { method: 'GET', authentication: 'none' }
}

function mediaTypeFor(path: string, callRoutes: readonly SiteDiscoveryCallRouteSummary[]): string {
  if (callRoutes.some((route) => route.path === path)) return CALL_ROUTE_CONTRACT.media.response
  if (path.endsWith('.txt')) return 'text/plain'
  if (path.endsWith('.xml')) return 'application/xml'
  if (path.endsWith('.md')) return 'text/markdown'
  if (path.startsWith('/api/') || path === SiteDiscoveryManifestPath) return 'application/json'
  return 'text/html'
}
