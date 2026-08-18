import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerOptionsPost,
  handleAgentCustomerRequestFactsPost,
  handleAgentCustomerRequestGet,
  handleAgentCustomerRequestMessagePost,
  handleAgentCustomerRequestPost,
} from '@/lib/server/customer-request-agent-api'
import type { AgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import { expectQuarantineWriteFrozen } from '../../helpers/http'

const key = 'agent-source-gateway-key-with-at-least-32-bytes'
const authenticate = async () => ({
  isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_agent_1', subject: 'user_1',
  userId: 'user_1', orgId: null, scopes: ['customer_requests:create'],
})
const resolvePrincipal = async (principal: AgentAccessPrincipal): Promise<AgentAccessPrincipal> => principal
describe('agent-native customer Request API', () => {
  it('returns the shared sensitive-input refusal without calling the application', async () => {
    const callAction = vi.fn()
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:sensitive', requestRef: 'request:agent:sensitive', agentRef: 'agent:test',
      request: 'Find the cheapest option. Card: 4242 4242 4242 4242; password is synthetic-password.',
    }), { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    expect(callAction).not.toHaveBeenCalled()
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
  })

  it('turns a scoped Clerk API key into a signed stable Convex principal without forwarding the bearer', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const callAction = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return {
        kind: 'request' as const, requestRef: 'request:agent:1', revision: 1, state: 'ready_to_compare' as const,
        summary: 'Ready', nextAction: 'prepare_options' as const, missingFields: [], options: [],
      }
    })
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:1', requestRef: 'request:agent:1', agentRef: 'caller-controlled', request: 'Find an option',
    }), { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it('uses the same scoped principal for resume and preparation', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const callAction = async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name.endsWith(':compare')) return {
        kind: 'request' as const, requestRef: 'request:agent:1', revision: 1, state: 'options_ready' as const,
        summary: 'Ready', nextAction: 'inspect_options' as const, missingFields: [], options: [],
      }
      return {
        kind: 'request' as const, requestRef: 'request:agent:1', revision: 1, state: 'ready_to_compare' as const,
        summary: 'Ready', nextAction: 'prepare_options' as const, missingFields: [], options: [],
        recovery: name.endsWith(':resume')
          ? { state: 'restored' as const, restoredAt: 1_000, workRestarted: false as const }
          : undefined,
      }
    }
    const resumedResponse = await handleAgentCustomerRequestGet(getRequest('/api/v1/requests/request:agent:1'), 'request:agent:1', {
      authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })
    await expectQuarantineWriteFrozen(resumedResponse, 'customerRequest.run')
    const optionsResponse = await handleAgentCustomerOptionsPost(request('/options', {
      revision: 1, idempotencyKey: 'prepare:1',
    }), 'request:agent:1', {
      authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })
    await expectQuarantineWriteFrozen(optionsResponse, 'customerRequest.run')
    expect(calls.map(({ name }) => name)).toEqual([])
  })

  it('signs a natural-language clarification as a refinement of the same Request', async () => {
    const callAction = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      kind: 'request' as const, requestRef: args.requestRef as string, revision: 2, state: 'ready_to_compare' as const,
      summary: 'Fremantle for lunch', nextAction: 'prepare_options' as const, missingFields: [], options: [],
    }))
    const response = await handleAgentCustomerRequestMessagePost(request('/api/v1/requests/request:1/messages', {
      idempotencyKey: 'message:1',
      expectedRevision: 1,
      message: 'Arrival before 09:00 is now immovable.',
      replacesPriorStatement: 'Arrival before 08:00 is immovable.',
    }), 'request:1', { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it('uses the human Request fact contract and signs the unchanged application command', async () => {
    const result = {
      kind: 'request' as const, requestRef: 'request:1', revision: 2, state: 'ready_to_compare' as const,
      summary: 'Ready', nextAction: 'prepare_options' as const, missingFields: [], options: [],
    }
    const callAction = vi.fn(async (_name: string, _args: Record<string, unknown>) => result)
    const response = await handleAgentCustomerRequestFactsPost(request('/api/v1/requests/request:1/facts', {
      idempotencyKey: 'facts:1', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    }), 'request:1', { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it('tells a cold external agent exactly how to answer the returned clarification', async () => {
    const callAction = vi.fn(async () => ({
      kind: 'request' as const,
      requestRef: 'request:agent:cold',
      revision: 1,
      state: 'needs_information' as const,
      summary: 'One detail is needed before AE can compare ways forward.',
      nextAction: 'provide_information' as const,
      missingFields: [{ field: 'lookup_instruction', label: 'Lookup instruction', explanation: 'What should the business look up?' }],
      clarification: {
        kind: 'contract_fact' as const,
        requirementKey: 'lookup_instruction',
        prompt: 'What should the business look up?',
        answerKind: 'typed_value' as const,
      },
      options: [],
    }))

    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:cold', requestRef: 'request:agent:cold', agentRef: 'cold-agent',
      request: 'Find the cheapest sandbox option.',
    }), { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it('gives a cold agent only a safe resume action for a durable pre-interpretation shell', async () => {
    const callAction = vi.fn(async () => ({
      kind: 'request' as const, requestRef: 'request:agent:retry', revision: 0,
      state: 'needs_attention' as const,
      summary: 'AE saved this Request but could not interpret it yet. Try again.',
      nextAction: 'retry' as const, missingFields: [], criteria: [], options: [],
    }))
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:retry', requestRef: 'request:agent:retry', agentRef: 'cold-agent',
      request: 'Find a labelled sandbox option.',
    }), { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it('tombstones agent resume GET as RFC 9457 410', async () => {
    const callAction = vi.fn()
    const response = await handleAgentCustomerRequestGet(getRequest('/api/v1/requests/request:agent:partial'), 'request:agent:partial', {
      authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(callAction).not.toHaveBeenCalled()
  })

  it.each(['missing', 'revoked', 'stale_generation'] as const)(
    'refuses a live Clerk key when the durable grant is %s before application dispatch',
    async (grantState) => {
      const callAction = vi.fn()
      const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
        idempotencyKey: `submit:grant:${grantState}`,
        requestRef: `request:grant:${grantState}`,
        agentRef: 'agent:test',
        request: 'Find an option',
      }), {
        authenticate,
        resolvePrincipal: async () => null,
        callAction,
      })

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ code: 'scope_required' })
      expect(callAction).not.toHaveBeenCalled()
    },
  )

  it('returns 401 for missing keys and 403 for unscoped keys before Convex', async () => {
    const callAction = vi.fn()
    const missing = await handleAgentCustomerRequestGet(getRequest('/api/v1/requests/request:1'), 'request:1', {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
      resolvePrincipal, callAction,
    })
    const unscoped = await handleAgentCustomerRequestGet(getRequest('/api/v1/requests/request:1'), 'request:1', {
      authenticate: async () => ({ isAuthenticated: true, tokenType: 'api_key', id: 'ak_1', subject: 'user_1', scopes: [] }),
      resolvePrincipal, callAction,
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
function getRequest(path: string): Request {
  return new Request(`https://ae.test${path}`, {
    headers: { Authorization: 'Bearer ak_test_secret' },
  })
}
