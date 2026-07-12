import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerOptionsPost,
  handleAgentCustomerRequestGet,
  handleAgentCustomerRequestPost,
} from '@/lib/server/customer-request-agent-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

const key = 'agent-source-gateway-key-with-at-least-32-bytes'
const authenticate = async () => ({
  isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_agent_1', subject: 'user_1',
  userId: 'user_1', orgId: null, scopes: ['customer_requests:create'],
})

describe('agent-native customer Request API', () => {
  it('turns a scoped Clerk API key into a signed stable Convex principal without forwarding the bearer', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const callAction = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return {
        kind: 'request', requestRef: 'request:agent:1', revision: 1, state: 'ready_to_compare',
        summary: 'Ready', nextAction: 'prepare_options', missingFields: [], options: [],
      }
    })
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:1', requestRef: 'request:agent:1', agentRef: 'caller-controlled', request: 'Find an option',
    }), { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })
    expect(response.status).toBe(200)
    const called = calls[0]
    expect(called?.name).toBe('customerRequestApplication:submit')
    expect(called?.args).toMatchObject({ delegatedAgentId: 'clerk_api_key:ak_agent_1' })
    expect(JSON.stringify(called)).not.toContain('Bearer')
    const { serviceAuth, ...command } = called?.args ?? {}
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'submit', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
  })

  it('uses the same scoped principal for resume and preparation', async () => {
    const names: string[] = []
    const callAction = async (name: string) => {
      names.push(name)
      return {
        kind: 'request', requestRef: 'request:agent:1', revision: 1, state: name.endsWith(':compare') ? 'options_ready' : 'ready_to_compare',
        summary: 'Ready', nextAction: name.endsWith(':compare') ? 'inspect_options' : 'prepare_options', missingFields: [], options: [],
      }
    }
    expect((await handleAgentCustomerRequestGet('request:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })).status).toBe(200)
    expect((await handleAgentCustomerOptionsPost(request('/options', { revision: 1 }), 'request:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })).status).toBe(200)
    expect(names).toEqual(['customerRequestApplication:resume', 'customerRequestApplication:compare'])
  })

  it('returns 401 for missing keys and 403 for unscoped keys before Convex', async () => {
    const callAction = vi.fn()
    const missing = await handleAgentCustomerRequestGet('request:1', {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }), callAction,
    })
    const unscoped = await handleAgentCustomerRequestGet('request:1', {
      authenticate: async () => ({ isAuthenticated: true, tokenType: 'api_key', id: 'ak_1', subject: 'user_1', scopes: [] }), callAction,
    })
    expect(missing.status).toBe(401)
    expect(unscoped.status).toBe(403)
    expect(callAction).not.toHaveBeenCalled()
  })
})

function request(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST', headers: { Authorization: 'Bearer ak_test_secret', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
