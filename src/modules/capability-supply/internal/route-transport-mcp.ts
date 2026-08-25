import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import {
  normalizeHeaders,
  type FetchLike,
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  cancelResponseBody,
  readBoundedRequestText,
} from '@/lib/server/bounded-request-body'
import {
  injectHttpJsonCredential,
  parseMcpJsonRpcTransportConfiguration,
  type McpJsonRpcTransportConfiguration,
} from './transport-adapters'
import type { RouteTransportInvocation } from './route-transport-invoke'
import {
  MAX_RESPONSE_BYTES,
  refused,
  unknown,
  type RouteTransportObservation,
} from './route-transport-observation'
import {
  callHeaders,
  containsSensitiveValue,
  errorName,
  optionalHeader,
  outboundSensitiveValues,
  toHeaderRecord,
  type RouteTransportFetch,
  type RouteTransportHeaderRecord,
} from './route-transport-http-json'

export const MCP_TOOL_LIST_PAGE_LIMIT = 32
export const MCP_TOOL_LIST_TOOL_LIMIT = 4_096

export type McpToolListPage = Readonly<{
  tools: readonly unknown[]
  nextCursor?: string
}>

export type McpToolListPageRead<Failure> =
  | Readonly<{ kind: 'ok'; page: McpToolListPage }>
  | Readonly<{ kind: 'error'; failure: Failure }>

export type McpToolLookupResult<Failure> =
  | Readonly<{ kind: 'found'; tool: Readonly<Record<string, unknown>> }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'page_limit' }>
  | Readonly<{ kind: 'tool_limit' }>
  | Readonly<{ kind: 'cursor_cycle' }>
  | Readonly<{ kind: 'error'; failure: Failure }>

export async function findMcpToolAcrossPages<Failure>(
  toolName: string,
  readPage: (
    cursor: string | undefined,
  ) => Promise<McpToolListPageRead<Failure>>,
): Promise<McpToolLookupResult<Failure>> {
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let toolCount = 0
  for (let page = 0; page < MCP_TOOL_LIST_PAGE_LIMIT; page += 1) {
    const read = await readPage(cursor)
    if (read.kind === 'error') return read
    toolCount += read.page.tools.length
    if (toolCount > MCP_TOOL_LIST_TOOL_LIMIT) return { kind: 'tool_limit' }
    const selected = read.page.tools.find(
      (tool) => isRecord(tool) && tool.name === toolName,
    )
    if (isRecord(selected)) return { kind: 'found', tool: selected }
    const nextCursor = read.page.nextCursor
    if (nextCursor === undefined) return { kind: 'missing' }
    if (nextCursor.trim().length === 0 || seenCursors.has(nextCursor)) {
      return { kind: 'cursor_cycle' }
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
  return { kind: 'page_limit' }
}

export type McpConfiguration = McpJsonRpcTransportConfiguration

export function isMcpConfiguration(
  value: Readonly<Record<string, unknown>>,
): value is McpConfiguration {
  return parseMcpJsonRpcTransportConfiguration(value) !== undefined
}

export async function invokeMcp(
  endpoint: URL,
  configuration: McpConfiguration,
  invocation: RouteTransportInvocation,
  credential: string | undefined,
  requestDigest: string,
  send: RouteTransportFetch,
): Promise<RouteTransportObservation> {
  if (configuration.protocolVersion !== LATEST_PROTOCOL_VERSION) {
    return refused('mcp', requestDigest, false, 'mcp_protocol_unsupported')
  }
  const common = injectHttpJsonCredential(
    {
      method: 'POST',
      requestTimeoutMs: configuration.requestTimeoutMs,
      ...(configuration.credential === undefined
        ? {}
        : { credential: configuration.credential }),
    },
    endpoint,
    callHeaders(invocation, undefined),
    credential,
  )
  if (common === undefined)
    return refused('mcp', requestDigest, false, 'credential_unavailable')

  const sensitiveValues = outboundSensitiveValues(invocation, credential)
  let lastResponseHeaders: RouteTransportHeaderRecord | undefined
  const fetchThroughGuard: FetchLike = async (input, init) => {
    const requestHeaders = normalizeHeaders(init?.headers)
    const requestSignal = init?.signal
    const signal =
      requestSignal === undefined ||
      requestSignal === null ||
      requestSignal.aborted
        ? AbortSignal.timeout(configuration.requestTimeoutMs)
        : AbortSignal.any([
            requestSignal,
            AbortSignal.timeout(configuration.requestTimeoutMs),
          ])
    const response = await send(
      typeof input === 'string' ? new URL(input) : new URL(input.href),
      {
        method: init?.method ?? 'GET',
        redirect: 'manual',
        signal,
        ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        headers: requestHeaders,
      },
    )
    const responseHeaders = toHeaderRecord(response)
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
      lastResponseHeaders = responseHeaders
    }

    const contentLength = Number(responseHeaders['content-length'])
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      await cancelResponseBody(response)
      throw Object.assign(new Error('payload_too_large'), {
        name: 'PayloadTooLarge',
      })
    }
    if (response.body === null)
      return new Response(null, {
        status: response.status,
        headers: responseHeaders,
      })
    const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
    if (!bounded.ok)
      throw Object.assign(new Error('payload_too_large'), {
        name: 'PayloadTooLarge',
      })
    return new Response(bounded.text, {
      status: response.status,
      headers: responseHeaders,
    })
  }
  const transport = new StreamableHTTPClientTransport(common.target, {
    requestInit: { redirect: 'manual', headers: common.headers },
    fetch: fetchThroughGuard,
    reconnectionOptions: {
      initialReconnectionDelay: configuration.requestTimeoutMs,
      maxReconnectionDelay: configuration.requestTimeoutMs,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  const clientTransport: Transport = {
    start: () => transport.start(),
    send: (message, options?: TransportSendOptions) =>
      transport.send(message, options),
    close: () => transport.close(),
    setProtocolVersion: (version) => transport.setProtocolVersion(version),
  }
  Object.defineProperties(clientTransport, {
    onclose: {
      configurable: true,
      get: () => transport.onclose,
      set: (handler: Transport['onclose']) => {
        if (handler === undefined) delete transport.onclose
        else transport.onclose = handler
      },
    },
    onerror: {
      configurable: true,
      get: () => transport.onerror,
      set: (handler: Transport['onerror']) => {
        if (handler === undefined) delete transport.onerror
        else transport.onerror = handler
      },
    },
    onmessage: {
      configurable: true,
      get: () => transport.onmessage,
      set: (handler: Transport['onmessage']) => {
        if (handler === undefined) delete transport.onmessage
        else transport.onmessage = handler
      },
    },
  })
  const client = new Client({ name: 'Agentic Economy', version: '1' })
  const requestOptions = {
    timeout: configuration.requestTimeoutMs,
    maxTotalTimeout: configuration.requestTimeoutMs,
  }
  const httpStatus = (error: unknown): number | undefined =>
    error instanceof StreamableHTTPError &&
    error.code !== undefined &&
    error.code >= 100
      ? error.code
      : undefined
  const invalidResponseError = (error: unknown): boolean =>
    (error instanceof StreamableHTTPError && error.code === -1) ||
    ['mcperror', 'payloadtoolarge', 'syntaxerror', 'zoderror'].includes(
      errorName(error),
    )

  try {
    try {
      await client.connect(clientTransport, requestOptions)
    } catch (error) {
      if (httpStatus(error) !== undefined)
        return refused('mcp', requestDigest, false, 'mcp_initialize_refused')
      if (invalidResponseError(error))
        return refused('mcp', requestDigest, false, 'mcp_initialize_invalid')
      return refused(
        'mcp',
        requestDigest,
        false,
        `mcp_initialize_${errorName(error)}`,
      )
    }
    if (
      transport.protocolVersion !== configuration.protocolVersion ||
      client.getServerCapabilities()?.tools === undefined
    ) {
      return refused('mcp', requestDigest, false, 'mcp_initialize_invalid')
    }

    const listed = await findMcpToolAcrossPages(
      configuration.toolName,
      async (cursor) => {
        try {
          const result = await client.listTools(
            cursor === undefined ? {} : { cursor },
            requestOptions,
          )
          return {
            kind: 'ok' as const,
            page: {
              tools: result.tools,
              ...(result.nextCursor === undefined
                ? {}
                : { nextCursor: result.nextCursor }),
            },
          }
        } catch (error) {
          return {
            kind: 'error' as const,
            failure:
              httpStatus(error) === undefined
                ? ('mcp_tools_list_invalid' as const)
                : ('mcp_tools_list_refused' as const),
          }
        }
      },
    )
    if (listed.kind === 'error')
      return refused('mcp', requestDigest, false, listed.failure)
    if (listed.kind === 'missing')
      return refused('mcp', requestDigest, false, 'mcp_tool_missing')
    if (listed.kind === 'cursor_cycle') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_cursor_cycle')
    }
    if (listed.kind === 'page_limit') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_page_limit')
    }
    if (listed.kind === 'tool_limit') {
      return refused('mcp', requestDigest, false, 'mcp_tools_list_tool_limit')
    }

    const input = parseBoundedJson(invocation.inputJson)
    if (!isRecord(input))
      return refused('mcp', requestDigest, false, 'input_invalid')
    try {
      const callResult = await client.callTool(
        { name: configuration.toolName, arguments: input },
        undefined,
        requestOptions,
      )
      if (containsSensitiveValue(callResult, sensitiveValues)) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      if (isRecord(callResult) && callResult.isError === true) {
        return refused('mcp', requestDigest, true, 'provider_refused')
      }
      const output = mcpOutput(callResult)
      if (output === undefined)
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      const providerReceipt =
        lastResponseHeaders === undefined
          ? {}
          : optionalHeader(
              lastResponseHeaders,
              'provider-receipt',
              'providerReceipt',
            )
      const continuationToken =
        lastResponseHeaders === undefined
          ? {}
          : optionalHeader(
              lastResponseHeaders,
              'continuation-token',
              'continuationToken',
            )
      if (
        containsSensitiveValue(output, sensitiveValues) ||
        containsSensitiveValue(providerReceipt, sensitiveValues) ||
        containsSensitiveValue(continuationToken, sensitiveValues)
      ) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      const outputJson = JSON.stringify(output)
      if (
        outputJson === undefined ||
        outputJson.length > MAX_RESPONSE_BYTES ||
        containsSensitiveValue(outputJson, sensitiveValues)
      ) {
        return unknown('mcp', requestDigest, true, 'mcp_output_invalid')
      }
      return {
        transport: 'mcp',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest,
        responseDigest: canonicalDigest(callResult as StableHashValue),
        outputJson,
        ...providerReceipt,
        ...continuationToken,
      }
    } catch (error) {
      const status = httpStatus(error)
      if (status !== undefined)
        return refused('mcp', requestDigest, true, `provider_http_${status}`)
      if (invalidResponseError(error))
        return unknown('mcp', requestDigest, true, 'mcp_result_invalid')
      return unknown('mcp', requestDigest, true, `network_${errorName(error)}`)
    }
  } finally {
    if (transport.sessionId !== undefined) {
      try {
        await transport.terminateSession()
      } catch {
        // Cleanup failures must not replace the invocation outcome.
      }
    }
    try {
      await transport.close()
    } catch {
      // Cleanup failures must not replace the invocation outcome.
    }
  }
}

function mcpOutput(result: unknown): unknown {
  if (!isRecord(result)) return undefined
  if (result.structuredContent !== undefined) return result.structuredContent
  if (!Array.isArray(result.content)) return undefined
  const text = result.content.find(
    (item) =>
      isRecord(item) && item.type === 'text' && typeof item.text === 'string',
  )
  return isRecord(text) && typeof text.text === 'string'
    ? parseBoundedJson(text.text)
    : undefined
}
