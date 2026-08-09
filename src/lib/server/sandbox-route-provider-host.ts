import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { problem } from '@/lib/server/problem'
import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from './sandbox-capability-provider'
import {
  SANDBOX_ROUTE_PROVIDER_PROFILES,
  type SandboxRouteProviderProfileKey,
} from '@/modules/sandbox-supply/public'

const MAX_REQUEST_BYTES = 64 * 1024

export function createSandboxRouteProviderServer(input: Readonly<{
  routeKey: SandboxRouteProviderProfileKey
  providerKey: string
}>): Server {
  if (input.providerKey.trim().length === 0) throw new Error('sandbox_route_provider_key_required')
  const expectedPath = SANDBOX_ROUTE_PROVIDER_PROFILES[input.routeKey].endpointPath
  return createServer(async (request, response) => {
    try {
      const url = requestUrl(request)
      if (url.pathname !== expectedPath) return send(response, problem({ status: 404, kind: 'NOT_FOUND', code: 'not_found', detail: 'not_found' }))
      if (request.method === 'GET') {
        return send(response, await readSandboxRouteProviderDiscovery(input.routeKey, new Request(url)))
      }
      if (request.method !== 'POST') {
        return send(response, problem({ status: 405, kind: 'METHOD_NOT_ALLOWED', code: 'method_not_allowed', detail: 'method_not_allowed' }, { Allow: 'GET, POST' }))
      }
      const body = await readBody(request)
      if (body === undefined) {
        return send(response, problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large', detail: 'request_too_large' }))
      }
      const providerRequest = new Request(url, {
        method: 'POST',
        headers: request.headers as HeadersInit,
        body,
      })
      return send(response, await handleSandboxRouteProviderRequest(input.routeKey, providerRequest, {
        providerKey: input.providerKey,
      }))
    } catch {
      return send(response, problem({ status: 500, kind: 'INTERNAL', code: 'provider_host_error', detail: 'provider_host_error' }))
    }
  })
}

function requestUrl(request: IncomingMessage): URL {
  const forwardedHost = request.headers['x-forwarded-host']?.toString().split(',', 1)[0]?.trim()
  const host = forwardedHost || request.headers.host
  if (host === undefined) throw new Error('sandbox_route_provider_host_header_required')
  const forwardedProtocol = request.headers['x-forwarded-proto']?.toString().split(',', 1)[0]?.trim()
  const protocol = forwardedProtocol === 'https' ? 'https' : 'http'
  return new URL(request.url ?? '/', `${protocol}://${host}`)
}

async function readBody(request: IncomingMessage): Promise<ArrayBuffer | undefined> {
  const chunks: Uint8Array[] = []
  let byteLength = 0
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
    byteLength += bytes.byteLength
    if (byteLength > MAX_REQUEST_BYTES) return undefined
    chunks.push(bytes)
  }
  const body = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}

async function send(response: ServerResponse, providerResponse: Response): Promise<void> {
  response.statusCode = providerResponse.status
  providerResponse.headers.forEach((value, name) => response.setHeader(name, value))
  response.end(new Uint8Array(await providerResponse.arrayBuffer()))
}
