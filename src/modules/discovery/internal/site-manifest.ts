import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import { schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  OPERATION_INVOKE_ROUTE_CONTRACT,
  OPERATION_INVOKE_ACTION_ID,
  OPERATION_INVOKE_SCOPE,
} from '@/modules/capability-execution/operation-invoke-entry'
import {
  operationInvokeResultKindValues,
  operationInvokeRefusalCodeValues,
} from '@/modules/capability-execution/operation-invoke-contracts'
import {
  operationInvokeStatusStateValues,
  operationInvokeStatusRefusalCodeValues,
} from '@/modules/capability-execution/operation-recovery-contracts'
import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '@/modules/customer-request/agent-contract'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '@/modules/customer-request/public-comprehension'
import { BUSINESS_TOOL_AGENT_SCOPE } from '@/modules/business-tools/public'
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
  operationRouteExamples,
  publicMcpToolDocs,
  type PublicMcpToolDoc,
  type PublicOperationRouteExample,
} from './operation-contract'
import { PublicAgentSkillPath } from './agent-skill'
import { DiscoveryListingBoundaryLine, DiscoveryPublicSurfacePaths } from './discovery-files'
import {
  DeveloperDiscoveryArtifacts,
  DeveloperDiscoveryPublicRoutes,
  DeveloperDiscoveryUnsupportedCapabilities,
} from '../developer-discovery'
import type { DeveloperDiscoveryUnsupportedCapability } from '../developer-discovery'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'
import { describeActionForAgent, findAction, type ActionInvocationContract } from '@/modules/actions'

export const SiteDiscoveryManifestSchemaVersion = 'ae-site-discovery:v2' as const

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
  'customer_request_submit',
  'answer_turn',
  'operation_read',
  'operation_invoke',
  'operation_status',
  'operation_cancel',
  'operation_reconcile',
  'customer_request_schema',
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
  authentication: 'none' | typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
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

type SiteDiscoveryOperationRouteContract = Readonly<{
  actionId: string
  contractVersion: string
  method: string
  path: string
  routerPath: string
  requiredHeaders: readonly string[]
  inputJsonSchema?: unknown
  outputJsonSchema?: unknown
  mcpToolName?: string
  example: PublicOperationRouteExample
}>

type SiteDiscoveryOperationRouteSummary = Omit<SiteDiscoveryOperationRouteContract, 'example'>

type SiteDiscoveryMcpToolContract = PublicMcpToolDoc

export type SiteDiscoveryManifestContract = Readonly<{
  schemaVersion: typeof SiteDiscoveryManifestSchemaVersion
  ucpVersion: 'v1'
  name: 'Agentic Economy'
  summary: readonly string[]
  origin: string
  generatedAt: number
  endpoints: readonly SiteDiscoveryEndpointContract[]
  customerRequest: Readonly<{
    contract: string
    method: 'POST'
    url: string
    authentication: typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
    requiredScope: string
    authorityModes: readonly string[]
    deviceAuthorizationUrl: string
    tokenUrl: string
    protectedResourceMetadataUrl: string
    keyRequestUrl: string
    navigationRelations: readonly string[]
    lifecycleStates: readonly string[]
  }>
  operationGateway: Readonly<{
    contract: typeof OPERATION_INVOKE_ROUTE_CONTRACT.invoke.contractVersion
    action: typeof OPERATION_INVOKE_ACTION_ID
    scope: typeof OPERATION_INVOKE_SCOPE
    routes: readonly SiteDiscoveryOperationRouteContract[]
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
      operationInvokeTool: string
      inputFields: readonly string[]
    }>
    executionModes: Readonly<{
      directKeyless: Readonly<{
        action: 'operation.execute'
        contractVersion: string
        invocationContract: ActionInvocationContract
        mcpTool: string
        authentication: 'none'
        requiresOperationRef: true
        eligibility: 'free_keyless_read_only'
        requiresExactDetailExecuteRelation: true
        inputJsonSchema?: unknown
        outputJsonSchema?: unknown
        description: string
      }>
      gateway: Readonly<{
        action: typeof OPERATION_INVOKE_ACTION_ID
        authentication: typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
        requiresOperationRef: true
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
    outcomes: typeof operationInvokeResultKindValues
    statusStates: typeof operationInvokeStatusStateValues
    refusalCodes: typeof operationInvokeRefusalCodeValues
    statusRefusalCodes: typeof operationInvokeStatusRefusalCodeValues
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
  businessManifestUrlTemplate: string
  businessTools: Readonly<{
    prepareUrlTemplate: string
    invokeUrlTemplate: string
    method: 'POST'
    authentication: typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
    requiredScope: string
    keyRequestUrl: string
    toolListSource: string
  }>
  boundary: string
  generatedHash: string
  unsupportedCapabilities: readonly DeveloperDiscoveryUnsupportedCapability[]
}>

export const SiteDiscoveryManifestPath = '/.well-known/ucp' as const
const businessManifestPath = '/{slug}/ucp' as const
const businessToolPath = '/{slug}/tools/{toolId}' as const
const agentKeyPath = '/agent-access' as const

const humanSurfaceLabels: Readonly<Record<string, string>> = {
  '/': 'Human entry point',
  '/claim': 'Claim your business page',
  '/for-agents': 'Guide for AI assistants',
  '/privacy/remove-business': 'Listing correction or removal',
  [SiteDiscoveryManifestPath]: 'This document',
  [PublicAgentSkillPath]: 'Assistant setup instructions',
}

/**
 * The site-level entry point a cold agent reads before it knows any business.
 *
 * Every path here is projected from a list that already governs another public
 * surface — the developer discovery routes and artifacts, the llms.txt public
 * surface list, and the Customer Request agent contract. Nothing is restated by
 * hand, so an endpoint cannot drift into this document without also changing
 * the surface that owns it.
 */
export function buildSiteDiscoveryManifest(
  input: Readonly<{ canonicalBaseUrl: string; now: number }>
): SiteDiscoveryManifestContract {
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const routes = operationRouteExamples().map(({ route, example }) => ({ ...route, example }))
  const mcpTools = publicMcpToolDocs()
  const operationInvokeTool = mcpTools.find((tool) => tool.actionId === OPERATION_INVOKE_ACTION_ID)
  if (operationInvokeTool === undefined) throw new Error('Operation invoke MCP tool is not registered')
  const operationInvokeAction = findAction(OPERATION_INVOKE_ACTION_ID)
  if (operationInvokeAction === undefined) throw new Error('Operation invoke action is not registered')
  const operationInvokeDescriptor = describeActionForAgent(operationInvokeAction)
  const directKeylessTool = mcpTools.find((tool) => tool.actionId === 'operation.execute')
  if (directKeylessTool === undefined) throw new Error('Keyless operation execute MCP tool is not registered')
  const directKeylessAction = findAction('operation.execute')
  if (directKeylessAction === undefined) throw new Error('Keyless operation execute action is not registered')
  const directKeylessActionId = directKeylessAction.id
  if (directKeylessActionId !== 'operation.execute') throw new Error('Registered keyless operation execute action has an unexpected id')
  const directKeylessDescriptor = describeActionForAgent(directKeylessAction)
  const body = {
    schemaVersion: SiteDiscoveryManifestSchemaVersion,
    ucpVersion: 'v1',
    name: 'Agentic Economy',
    summary: CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES,
    origin,
    endpoints: buildEndpoints(origin),
    customerRequest: {
      contract: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.contract,
      method: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method,
      url: `${origin}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
      schemaUrl: `${origin}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
      authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
      requiredScope: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope,
      authorityModes: CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
      deviceAuthorizationUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}`,
      tokenUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.token}`,
      protectedResourceMetadataUrl: `${origin}${AGENT_ACCESS_OAUTH_PATHS.protectedResourceMetadata}`,
      keyRequestUrl: `${origin}${agentKeyPath}`,
      navigationRelations: CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
      lifecycleStates: CUSTOMER_REQUEST_STATE_VALUES,
    },
    operationGateway: {
      contract: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.contractVersion,
      action: OPERATION_INVOKE_ACTION_ID,
      scope: OPERATION_INVOKE_SCOPE,
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
        requestMediaType: OPERATION_INVOKE_ROUTE_CONTRACT.media.request,
        responseMediaType: OPERATION_INVOKE_ROUTE_CONTRACT.media.response,
        idempotencyLocation: 'body.idempotencyKey',
        authorizationHeader: OPERATION_INVOKE_ROUTE_CONTRACT.headers.authorization,
        problemMediaType: OPERATION_INVOKE_ROUTE_CONTRACT.media.problem,
        retry: {
          retryableField: 'retryable',
          retryAfterHeader: 'Retry-After',
          retryableRule: 'respect_retry_after_same_material',
          uncertainRule: 'status_then_recover_same_identity',
        },
      },
      mcp: {
        endpoint: `${origin}/mcp`,
        operationInvokeTool: operationInvokeTool.name,
        protocolVersion: MCP_LATEST_PROTOCOL_VERSION,
        lifecycle: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'close'],
        inputFields: Object.keys(operationInvokeDescriptor.inputJsonSchema?.properties ?? {}),
      },
      executionModes: {
        directKeyless: {
          action: directKeylessActionId,
          contractVersion: directKeylessAction.invocationContract.version,
          invocationContract: directKeylessAction.invocationContract,
          mcpTool: directKeylessTool.name,
          authentication: 'none',
          requiresOperationRef: true,
          eligibility: 'free_keyless_read_only',
          requiresExactDetailExecuteRelation: true,
          ...(directKeylessDescriptor.inputJsonSchema === undefined ? {} : { inputJsonSchema: directKeylessDescriptor.inputJsonSchema }),
          ...(directKeylessDescriptor.outputJsonSchema === undefined ? {} : { outputJsonSchema: directKeylessDescriptor.outputJsonSchema }),
          description: 'Optional anonymous observation for current free, keyless, read-only Operations; use it only when exact current detail includes the execute relation.',
        },
        gateway: {
          action: OPERATION_INVOKE_ACTION_ID,
          authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
          requiresOperationRef: true,
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
      outcomes: operationInvokeResultKindValues,
      statusStates: operationInvokeStatusStateValues,
      refusalCodes: operationInvokeRefusalCodeValues,
      statusRefusalCodes: operationInvokeStatusRefusalCodeValues,
      recovery: {
        statusAction: OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId,
        advancedActions: {
          cancel: OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId,
          reconcile: OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId,
        },
        retryRule: 'inspect_status_then_recover_uncertain',
      },
    },
    assistantSetup: {
      instructionsUrl: `${origin}${PublicAgentSkillPath}`,
      publicIndexUrl: `${origin}/llms.txt`,
      humanGuideUrl: `${origin}/for-agents`,
    },
    businessManifestUrlTemplate: `${origin}${businessManifestPath}`,
    businessTools: {
      prepareUrlTemplate: `${origin}${businessToolPath}/prepare`,
      invokeUrlTemplate: `${origin}${businessToolPath}`,
      method: 'POST',
      authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
      requiredScope: BUSINESS_TOOL_AGENT_SCOPE,
      keyRequestUrl: `${origin}${agentKeyPath}`,
      toolListSource: `${origin}${businessManifestPath}`,
    },
    boundary: `${DiscoveryListingBoundaryLine} The published business catalog is business-only; an Agent Service is one admitted Market Operation.`,
    unsupportedCapabilities: DeveloperDiscoveryUnsupportedCapabilities,
  } as const

  return { ...body, generatedAt: input.now, generatedHash: schemaDescriptorDigest(body as StableHashValue) }
}

function buildEndpoints(origin: string): readonly SiteDiscoveryEndpointContract[] {
  const operationRoutes: readonly SiteDiscoveryOperationRouteSummary[] = operationRouteExamples().map(({ route }) => route)
  const labels: Readonly<Record<string, string>> = {
    ...humanSurfaceLabels,
    [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path]: 'Customer Request submission',
    [ANSWER_THREAD_AGENT_ENTRYPOINT.path]: 'Keyless Answer Thread turn',
    ...Object.fromEntries(operationRoutes.map((route) => [route.path, `Operation ${route.actionId}`])),
    ...Object.fromEntries(OPERATION_MARKET_ACTION_ENTRIES.map((entry) => [entry.pathTemplate, `Operation ${entry.relation}`])),
    [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath]: 'Customer Request contract schema',
    ...Object.fromEntries(DeveloperDiscoveryPublicRoutes.map((route) => [route.path, route.label])),
    ...Object.fromEntries(DeveloperDiscoveryArtifacts.map((artifact) => [artifact.route, artifact.label])),
    '/api/businesses': 'Published business catalog list',
    '/api/businesses/search?q=': 'Published business catalog search',
    '/api/businesses/{slug}': 'Published business catalog detail',
  }
  const paths: readonly string[] = [
    CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path,
    ANSWER_THREAD_AGENT_ENTRYPOINT.path,
    CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath,
    ...operationRoutes.map((route) => route.path),
    ...DiscoveryPublicSurfacePaths,
    PublicAgentSkillPath,
    ...DeveloperDiscoveryPublicRoutes.map((route) => route.path),
    ...DeveloperDiscoveryArtifacts.map((artifact) => artifact.route),
  ]

  const seen = new Set<string>()
  const endpoints: SiteDiscoveryEndpointContract[] = []
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    const access = accessFor(path, operationRoutes)
    const operationRead = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
    const operationAction = operationRead === undefined ? undefined : findAction(operationRead.actionId)
    if (operationRead !== undefined && operationAction === undefined) {
      throw new Error(`Operation market action is not registered: ${operationRead.actionId}`)
    }
    const operationDescriptor = operationAction === undefined ? undefined : describeActionForAgent(operationAction)
    const operationMetadata = operationAction === undefined || operationDescriptor === undefined
      ? undefined
      : {
        actionId: operationDescriptor.id,
        contractVersion: operationAction.invocationContract.version,
        ...(operationDescriptor.inputJsonSchema === undefined ? {} : { inputJsonSchema: operationDescriptor.inputJsonSchema }),
        ...(operationDescriptor.outputJsonSchema === undefined ? {} : { outputJsonSchema: operationDescriptor.outputJsonSchema }),
      }
    endpoints.push({
      kind: kindFor(path, operationRoutes),
      label: labels[path] ?? path,
      method: access.method,
      path,
      url: `${origin}${path}`,
      templated: path.includes('{'),
      mediaType: mediaTypeFor(path, operationRoutes),
      authentication: access.authentication,
      ...(access.requiredScope === undefined ? {} : { requiredScope: access.requiredScope }),
      ...(access.requiredHeaders === undefined ? {} : { requiredHeaders: access.requiredHeaders }),
      ...(operationMetadata === undefined ? {} : operationMetadata),
    })
  }

  return endpoints
}

function kindFor(path: string, operationRoutes: readonly SiteDiscoveryOperationRouteSummary[]): SiteDiscoveryEndpointKind {
  if (OPERATION_MARKET_ACTION_ENTRIES.some((entry) => entry.pathTemplate === path)) return 'operation_read'
  const operationRoute = operationRoutes.find((route) => route.path === path)
  if (operationRoute?.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId) return 'operation_invoke'
  if (operationRoute?.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId) return 'operation_status'
  if (operationRoute?.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId) return 'operation_cancel'
  if (operationRoute?.actionId === OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId) return 'operation_reconcile'
  if (path === SiteDiscoveryManifestPath) return 'site_entry_point'
  if (path === ANSWER_THREAD_AGENT_ENTRYPOINT.path) return 'answer_turn'
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path) return 'customer_request_submit'
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath) return 'customer_request_schema'
  if (path === PublicAgentSkillPath) return 'assistant_setup'
  if (path === businessManifestPath) return 'business_manifest'
  if (path === '/privacy/remove-business') return 'privacy_request'
  if (path.startsWith('/api/discovery/')) return 'discovery_artifact'
  if (path === '/api/businesses') return 'catalog_list'
  if (path.startsWith('/api/businesses/search')) return 'catalog_search'
  if (path.startsWith('/api/businesses/')) return 'catalog_detail'
  if (path.startsWith('/api/')) return 'discovery_file'
  if (path.includes('.')) return 'discovery_file'
  return 'human_surface'
}

function accessFor(path: string, operationRoutes: readonly SiteDiscoveryOperationRouteSummary[]): Readonly<{
  method: 'GET' | 'POST'
  authentication: 'none' | typeof CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication
  requiredScope?: string
  requiredHeaders?: Readonly<Record<string, string>>
}> {
  const marketOperation = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  if (marketOperation !== undefined) {
    return { method: marketOperation.method, authentication: marketOperation.authentication }
  }
  const operationRoute = operationRoutes.find((route) => route.path === path)
  if (operationRoute !== undefined) {
    return {
      method: operationRoute.method as 'GET' | 'POST',
      authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
      requiredScope: OPERATION_INVOKE_SCOPE,
      requiredHeaders: Object.fromEntries(operationRoute.requiredHeaders.map((header) => [header, 'required'])),
    }
  }
  if (path === ANSWER_THREAD_AGENT_ENTRYPOINT.path) {
    return {
      method: ANSWER_THREAD_AGENT_ENTRYPOINT.method,
      authentication: ANSWER_THREAD_AGENT_ENTRYPOINT.authentication,
      requiredHeaders: ANSWER_THREAD_AGENT_ENTRYPOINT.requiredHeaders,
    }
  }
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path) {
    return {
      method: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method,
      authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
      requiredScope: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope,
    }
  }
  return { method: 'GET', authentication: 'none' }
}

function mediaTypeFor(path: string, operationRoutes: readonly SiteDiscoveryOperationRouteSummary[]): string {
  if (operationRoutes.some((route) => route.path === path)) return OPERATION_INVOKE_ROUTE_CONTRACT.media.response
  if (path === ANSWER_THREAD_AGENT_ENTRYPOINT.path) return ANSWER_THREAD_AGENT_ENTRYPOINT.responseMediaType
  if (path.endsWith('.txt')) return 'text/plain'
  if (path.endsWith('.xml')) return 'application/xml'
  if (path.endsWith('.md')) return 'text/markdown'
  if (path.startsWith('/api/') || path === businessManifestPath || path === SiteDiscoveryManifestPath) return 'application/json'
  return 'text/html'
}
