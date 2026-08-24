import { parseJsonEventStream } from '@ai-sdk/provider-utils'
import { afterEach, beforeEach, vi } from 'vitest'
import { z } from 'zod'

import { handleMcpRequest as handleMcpRequestImpl } from '@/lib/server/mcp-api'

export function handleMcpRequest(
  ...args: Parameters<typeof handleMcpRequestImpl>
): ReturnType<typeof handleMcpRequestImpl> {
  return handleMcpRequestImpl(...args)
}

const hoistedMcpApiMocks = vi.hoisted(() => ({
  executeKeylessOperation: vi.fn(),
}))

export const operationExecuteMocks = {
  executeKeylessOperation: hoistedMcpApiMocks.executeKeylessOperation,
}

vi.mock('@/modules/capability-execution/operation-execute.server', () => ({
  executeKeylessOperation: hoistedMcpApiMocks.executeKeylessOperation,
}))

export type JsonRpcBody = {
  result?: Record<string, unknown>
  error?: Record<string, unknown>
}

function pinEnv(): void {
  vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
  vi.stubEnv('CONVEX_URL', undefined)
  vi.stubEnv('VITE_CONVEX_URL', undefined)
}

export const currentOperationRef = `operation:v1:${'a'.repeat(64)}`

export function authenticateWithScopes(scopes: readonly string[]) {
  return async () => ({
    isAuthenticated: true as const,
    tokenType: 'api_key' as const,
    id: 'key:test',
    subject: 'user_test',
    scopes: [...scopes],
  })
}

export async function postMcp(
  body: object,
  options: Parameters<typeof handleMcpRequest>[1] = {},
  headers: HeadersInit = {},
): Promise<Response> {
  const request = new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return handleMcpRequest(request, options)
}

export async function readMcpBody(response: Response): Promise<JsonRpcBody> {
  const text = await response.text()
  if (response.headers.get('content-type')?.includes('text/event-stream') === true) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${text}\n\n`))
        controller.close()
      },
    })
    for await (const candidate of parseJsonEventStream({ stream, schema: z.unknown() })) {
      if (!candidate.success) continue
      return candidate.value as JsonRpcBody
    }
    throw new Error('MCP stream did not include a data event.')
  }
  return JSON.parse(text) as JsonRpcBody
}

beforeEach(() => {
  vi.restoreAllMocks()
  operationExecuteMocks.executeKeylessOperation.mockReset()
  pinEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
})
