import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClerkAPIResponseError } from '@clerk/shared/error'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { authenticateWithScopes, handleMcpRouteRequest } from './mcp-api-harness'

const verify = vi.fn(async () => { throw new ClerkAPIResponseError('invalid api key', { status: 401, data: [] }) })
vi.mock('@clerk/tanstack-react-start/server', () => ({ clerkClient: () => ({ apiKeys: { verify } }) }))

function ping(headers: HeadersInit) {
  return new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
}

async function bucketsFor(request: Request, options = {}, refuseAt = 'mcp-authentication') {
  const names: string[] = []
  setHttpRateLimitAdmissionForTests(async (input) => {
    names.push(input.name)
    return input.name === refuseAt ? { ok: false, retryAfter: 1 } : { ok: true }
  })
  await handleMcpRouteRequest(request, options)
  return names
}

afterEach(() => { setHttpRateLimitAdmissionForTests(undefined); verify.mockClear() })

describe('MCP admission bounds verification independently of anonymous discovery', () => {
  it('refuses an exhausted verification quota before calling Clerk', async () => {
    expect(await bucketsFor(ping({ authorization: 'Bearer junk' }))).toEqual(['mcp-authentication'])
    expect(verify).not.toHaveBeenCalled()
  })

  it.each(['authorization', 'x-api-key'])('keeps junk %s credentials outside public-read', async (header) => {
    expect(await bucketsFor(ping({ [header]: 'junk' }), {}, 'none'))
      .toEqual(['mcp-authentication', 'mcp-anonymous'])
  })

  it('also charges a verified key to public-read', async () => {
    const authenticate = authenticateWithScopes([])
    expect(await bucketsFor(ping({ authorization: 'Bearer valid' }), { authenticate }, 'public-read'))
      .toEqual(['mcp-authentication', 'public-read'])
  })

  it('verifies an invalid key with Clerk exactly once', async () => {
    const request = new Request('https://ae.example/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer junk' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    await bucketsFor(request, {}, 'none')
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('keeps credential rotation in the same per-IP verification quota', async () => {
    const keys: string[] = []
    setHttpRateLimitAdmissionForTests(async ({ name, key }) => {
      expect(name).toBe('mcp-authentication')
      keys.push(key)
      return { ok: false, retryAfter: 1_250 }
    })
    for (const token of ['junk-first', 'junk-second']) {
      const response = await handleMcpRouteRequest(ping({ authorization: `Bearer ${token}` }))
      expect(response.status).toBe(429)
      expect(response.headers.get('retry-after')).toBe('2')
    }
    expect(keys[0]).toBe(keys[1])
    expect(verify).not.toHaveBeenCalled()
  })

  it('never verifies an anonymous request', async () => {
    expect(await bucketsFor(ping({}), {}, 'mcp-anonymous')).toEqual(['mcp-anonymous'])
    expect(verify).not.toHaveBeenCalled()
  })
})
