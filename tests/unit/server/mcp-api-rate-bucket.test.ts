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

async function bucketsFor(request: Request, options = {}, refuseAt = 'mcp-anonymous') {
  const names: string[] = []
  setHttpRateLimitAdmissionForTests(async (input) => {
    names.push(input.name)
    return input.name === refuseAt ? { ok: false, retryAfter: 1 } : { ok: true }
  })
  await handleMcpRouteRequest(request, options)
  return names
}

afterEach(() => { setHttpRateLimitAdmissionForTests(undefined); verify.mockClear() })

describe('MCP admission runs per-IP first, then verifies', () => {
  it('admits every credentialed request anonymously before calling Clerk', async () => {
    expect(await bucketsFor(ping({ authorization: 'Bearer junk' }))).toEqual(['mcp-anonymous'])
    expect(verify).not.toHaveBeenCalled()
  })

  it('charges junk credentials to the anonymous bucket only', async () => {
    expect(await bucketsFor(ping({ 'x-api-key': 'junk' }), {}, 'none')).toContain('mcp-anonymous')
    expect(await bucketsFor(ping({ 'x-api-key': 'junk' }), {}, 'none')).not.toContain('public-read')
  })

  it('also charges a verified key to public-read', async () => {
    const authenticate = authenticateWithScopes([])
    expect(await bucketsFor(ping({ authorization: 'Bearer valid' }), { authenticate }, 'public-read'))
      .toEqual(['mcp-anonymous', 'public-read'])
  })
})
