import { afterEach, describe, expect, it, vi } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { authenticateWithScopes, handleMcpRouteRequest } from './mcp-api-harness'

const verify = vi.fn(async () => { throw new Error('invalid api key') })
vi.mock('@clerk/tanstack-react-start/server', () => ({ clerkClient: () => ({ apiKeys: { verify } }) }))

function ping(headers: HeadersInit) {
  return new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
}

async function bucketFor(request: Request, options = {}) {
  let name: string | undefined
  setHttpRateLimitAdmissionForTests(async (input) => { name = input.name; return { ok: false, retryAfter: 1 } })
  await handleMcpRouteRequest(request, options)
  return name
}

afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

describe('MCP admission bucket follows verified identity', () => {
  it('puts no-credential and junk-credential requests in the anonymous bucket', async () => {
    expect(await bucketFor(ping({}))).toBe('mcp-anonymous')
    expect(await bucketFor(ping({ authorization: 'Bearer junk' }))).toBe('mcp-anonymous')
    expect(await bucketFor(ping({ 'x-api-key': 'junk' }))).toBe('mcp-anonymous')
  })

  it('puts a verified key in the authenticated bucket', async () => {
    const authenticate = authenticateWithScopes([])
    expect(await bucketFor(ping({ authorization: 'Bearer valid' }), { authenticate })).toBe('public-read')
  })
})
