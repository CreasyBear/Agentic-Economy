import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type FetchLike,
  type OAuthClientProvider,
} from '@modelcontextprotocol/client'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { JsonValue } from '@/modules/capability-contract/public'
import {
  MCP_TOOL_LIST_PAGE_LIMIT,
  MCP_TOOL_LIST_TOOL_LIMIT,
} from '@/modules/capability-supply/route-transport-runtime'
import { inspectSource, validHttpsUrl } from './publication-importer-types'
import type { McpSourceDiscovery } from '../source-preview'

const REQUEST_TIMEOUT_MS = 10_000
const MAXIMUM_RESPONSE_BYTES = 262_144

export function createGuardedMcpFetch(
  injectedSend?: (request: Request) => Promise<Response>,
): FetchLike {
  return async (resource, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const requestSignal = init?.signal
    const signal = requestSignal === undefined || requestSignal === null || requestSignal.aborted
      ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      : AbortSignal.any([requestSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    const request = new Request(resource, {
      method,
      redirect: 'manual',
      signal,
      ...(init?.headers === undefined ? {} : { headers: init.headers }),
      ...(init?.body === undefined || method === 'GET' || method === 'HEAD'
        ? {}
        : { body: init.body }),
    })
    const send = injectedSend ?? (async (guardedRequest: Request) => {
      const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
      return await sendGuardedHttpRequest(guardedRequest, MAXIMUM_RESPONSE_BYTES)
    })
    const response = await send(request)
    const bounded = await readBoundedRequestText(response, MAXIMUM_RESPONSE_BYTES)
    if (!bounded.ok) throw Object.assign(new Error('payload_too_large'), { name: 'PayloadTooLarge' })
    return new Response(bounded.text, { status: response.status, headers: response.headers })
  }
}

export async function discoverMcpSource(input: Readonly<{
  serverUrl?: string
  registryName?: string
  remoteRef?: string
  environment: 'sandbox' | 'production'
}>, dependencies: Readonly<{
  isPublicTarget?: (target: URL) => Promise<boolean>
  send?: (request: Request) => Promise<Response>
  authProvider?: OAuthClientProvider
  requiredServerUrl?: string
}> = {}): Promise<McpSourceDiscovery> {
  if (input.registryName !== undefined) {
    const registry = await resolveMcpRegistryRemote(input.registryName, input.remoteRef, dependencies.send)
    if (registry.kind === 'refused') return registry
    if (registry.kind === 'remote_selection_required') return registry
    const discovered = await discoverMcpSource({
      serverUrl: registry.serverUrl,
      environment: input.environment,
    }, dependencies)
    return discovered.kind !== 'ready' ? discovered : {
      ...discovered,
      registryName: registry.registryName,
      verifiedNamespace: true,
      sourceDigest: canonicalDigest({
        registryName: registry.registryName,
        registryVersion: registry.version,
        registrySchema: registry.schema,
        remoteDigest: discovered.sourceDigest,
      }),
    }
  }
  const serverUrl = input.serverUrl === undefined ? undefined : validHttpsUrl(input.serverUrl)
  if (serverUrl === undefined) return { kind: 'refused', reason: 'mcp_server_url_invalid' }
  if (dependencies.requiredServerUrl !== undefined && serverUrl !== dependencies.requiredServerUrl) {
    return { kind: 'refused', reason: 'mcp_connection_resource_mismatch' }
  }
  const target = new URL(serverUrl)
  const isPublicTarget = dependencies.isPublicTarget ?? (async (candidate: URL) => {
    const { defaultDnsResolver, isPublicHttpTarget } = await import('@/modules/network-guard/public')
    return await isPublicHttpTarget(candidate, defaultDnsResolver)
  })
  if (!await isPublicTarget(target)) {
    return { kind: 'refused', reason: 'mcp_server_url_not_public' }
  }

  const transport = new StreamableHTTPClientTransport(target, {
    fetch: createGuardedMcpFetch(dependencies.send),
    ...(dependencies.authProvider === undefined ? {} : { authProvider: dependencies.authProvider }),
    requestInit: { redirect: 'manual' },
    reconnectionOptions: {
      initialReconnectionDelay: REQUEST_TIMEOUT_MS,
      maxReconnectionDelay: REQUEST_TIMEOUT_MS,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  const client = new Client(
    { name: 'Agentic Economy Provider Preview', version: '1' },
    { listMaxPages: MCP_TOOL_LIST_PAGE_LIMIT },
  )
  const requestOptions = { timeout: REQUEST_TIMEOUT_MS, maxTotalTimeout: REQUEST_TIMEOUT_MS }

  try {
    try {
      await client.connect(transport, requestOptions)
    } catch (error) {
      const status = mcpHttpStatus(error)
      if (status === 401 || status === 403) {
        return {
          kind: 'authentication_required',
          authenticationUrl: `/owner/supply?source=mcp&serverUrl=${encodeURIComponent(serverUrl)}`,
          serverUrl,
        }
      }
      return { kind: 'refused', reason: 'mcp_initialize_failed' }
    }
    if (client.getServerCapabilities()?.tools === undefined) {
      return { kind: 'refused', reason: 'mcp_tools_unsupported' }
    }

    const tools: unknown[] = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    for (let page = 0; page < MCP_TOOL_LIST_PAGE_LIMIT; page += 1) {
      let result: Awaited<ReturnType<Client['listTools']>>
      try {
        result = await client.listTools(cursor === undefined ? {} : { cursor }, requestOptions)
      } catch (error) {
        const status = mcpHttpStatus(error)
        if (status === 401 || status === 403) {
          return {
            kind: 'authentication_required',
            authenticationUrl: `/owner/supply?source=mcp&serverUrl=${encodeURIComponent(serverUrl)}`,
            serverUrl,
          }
        }
        return { kind: 'refused', reason: 'mcp_tools_list_failed' }
      }
      tools.push(...result.tools)
      if (tools.length > MCP_TOOL_LIST_TOOL_LIMIT) {
        return { kind: 'refused', reason: 'mcp_tools_limit_exceeded' }
      }
      if (result.nextCursor === undefined) break
      if (result.nextCursor.trim().length === 0 || seenCursors.has(result.nextCursor)) {
        return { kind: 'refused', reason: 'mcp_cursor_invalid' }
      }
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
      if (page === MCP_TOOL_LIST_PAGE_LIMIT - 1) {
        return { kind: 'refused', reason: 'mcp_page_limit_exceeded' }
      }
    }

    const normalizedTools = tools.map(normalizeTool)
    if (normalizedTools.some((tool) => tool === undefined)) {
      return { kind: 'refused', reason: 'mcp_tool_contract_invalid' }
    }
    const exactTools = normalizedTools.filter((tool): tool is NonNullable<typeof tool> => tool !== undefined)
    const bounded = inspectSource({
      serverUrl,
      protocolVersion: transport.protocolVersion ?? 'unknown',
      tools: exactTools,
    })
    if (bounded.kind === 'refused') return { kind: 'refused', reason: bounded.reason }
    return {
      kind: 'ready',
      serverUrl,
      protocolVersion: transport.protocolVersion ?? 'unknown',
      sourceDigest: canonicalDigest({
        serverUrl,
        protocolVersion: transport.protocolVersion ?? 'unknown',
        tools: exactTools,
      }),
      tools: exactTools,
    }
  } finally {
    if (transport.sessionId !== undefined) {
      await transport.terminateSession().catch(() => undefined)
    }
    await transport.close().catch(() => undefined)
  }
}

async function resolveMcpRegistryRemote(
  registryName: string,
  selectedRemoteRef?: string,
  injectedSend?: ((request: Request) => Promise<Response>) | undefined,
): Promise<Readonly<{
  kind: 'ready'
  registryName: string
  version: string
  schema: string
  serverUrl: string
  remoteRef: string
  metadataDigest: string
}> | Readonly<{
  kind: 'remote_selection_required'
  registryName: string
  sourceDigest: string
  sourceRevision: string
  remotes: readonly Readonly<{ remoteRef: string; name: string; serverUrl: string }>[]
}> | Readonly<{ kind: 'refused'; reason: string }>> {
  const normalizedName = registryName.trim()
  if (!/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/u.test(normalizedName)) {
    return { kind: 'refused', reason: 'mcp_registry_name_invalid' }
  }
  const url = new URL(
    `/v0.1/servers/${encodeURIComponent(normalizedName)}/versions/latest`,
    'https://registry.modelcontextprotocol.io',
  )
  const send = injectedSend ?? (async (request: Request) => {
    const { sendGuardedHttpRequest } = await import('@/modules/network-guard/server')
    return await sendGuardedHttpRequest(request, MAXIMUM_RESPONSE_BYTES)
  })
  let response: Response
  try {
    response = await send(new Request(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    }))
  } catch {
    return { kind: 'refused', reason: 'mcp_registry_unavailable' }
  }
  if (!response.ok) return { kind: 'refused', reason: 'mcp_registry_entry_not_found' }
  const bounded = await readBoundedRequestText(response, MAXIMUM_RESPONSE_BYTES)
  if (!bounded.ok) return { kind: 'refused', reason: 'mcp_registry_response_too_large' }
  let body: unknown
  try {
    body = JSON.parse(bounded.text)
  } catch {
    return { kind: 'refused', reason: 'mcp_registry_response_invalid' }
  }
  if (!isRecord(body) || !isRecord(body.server) || !isRecord(body._meta)) {
    return { kind: 'refused', reason: 'mcp_registry_response_invalid' }
  }
  const server = body.server
  const official = body._meta['io.modelcontextprotocol.registry/official']
  if (!isRecord(official) || official.status !== 'active' || server.name !== normalizedName
    || typeof server.version !== 'string' || typeof server.$schema !== 'string'
    || !Array.isArray(server.remotes)) {
    return { kind: 'refused', reason: 'mcp_registry_entry_inactive' }
  }
  const remotes = server.remotes.flatMap((remote) => {
    if (!isRecord(remote) || remote.type !== 'streamable-http'
      || typeof remote.url !== 'string' || remote.headers !== undefined) return []
    const serverUrl = validHttpsUrl(remote.url)
    if (serverUrl === undefined) return []
    return [{
      remoteRef: canonicalDigest({
        format: 'mcp-registry-remote:v1',
        registryName: normalizedName,
        version: server.version,
        schema: server.$schema,
        transport: 'streamable-http',
        serverUrl,
      }),
      name: new URL(serverUrl).host + new URL(serverUrl).pathname,
      serverUrl,
    }]
  })
  if (remotes.length === 0) return { kind: 'refused', reason: 'mcp_registry_remote_missing' }
  if (remotes.length > 8) return { kind: 'refused', reason: 'mcp_registry_remote_limit_exceeded' }
  const metadataDigest = canonicalDigest({
    registryName: normalizedName,
    registryVersion: server.version,
    registrySchema: server.$schema,
    remotes,
  })
  if (selectedRemoteRef === undefined) {
    return {
      kind: 'remote_selection_required',
      registryName: normalizedName,
      sourceDigest: metadataDigest,
      sourceRevision: `mcp-registry:${metadataDigest}`,
      remotes,
    }
  }
  const selected = remotes.find(({ remoteRef }) => remoteRef === selectedRemoteRef)
  if (selected === undefined) return { kind: 'refused', reason: 'mcp_registry_remote_selection_invalid' }
  return {
    kind: 'ready',
    registryName: normalizedName,
    version: server.version,
    schema: server.$schema,
    serverUrl: selected.serverUrl,
    remoteRef: selected.remoteRef,
    metadataDigest,
  }
}

function normalizeTool(tool: unknown): Readonly<{
  name: string
  title?: string
  description?: string
  inputSchema: Readonly<Record<string, JsonValue>>
  outputSchema?: Readonly<Record<string, JsonValue>>
}> | undefined {
  if (!isRecord(tool) || typeof tool.name !== 'string' || !isRecord(tool.inputSchema)) return undefined
  if (tool.outputSchema !== undefined && !isRecord(tool.outputSchema)) return undefined
  return {
    name: tool.name,
    ...(typeof tool.title === 'string' ? { title: tool.title } : {}),
    ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
    inputSchema: tool.inputSchema as Readonly<Record<string, JsonValue>>,
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema as Readonly<Record<string, JsonValue>> }),
  }
}

function mcpHttpStatus(error: unknown): number | undefined {
  if (UnauthorizedError.isInstance(error)) return 401
  if (SdkHttpError.isInstance(error) && typeof error.data?.status === 'number') {
    return error.data.status
  }
  return undefined
}
