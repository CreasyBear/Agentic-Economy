import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerOptionsPost,
  handleAgentCustomerRequestFactsPost,
  handleAgentCustomerRequestGet,
  handleAgentCustomerRequestMessagePost,
  handleAgentCustomerRequestPost,
} from '@/lib/server/customer-request-agent-api'
import { customerRequestAgentResultSchema } from '@/modules/customer-request/agent-contract'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

const key = 'agent-source-gateway-key-with-at-least-32-bytes'
const authenticate = async () => ({
  isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_agent_1', subject: 'user_1',
  userId: 'user_1', orgId: null, scopes: ['customer_requests:create'],
})

describe('agent-native customer Request API', () => {
  it('returns the shared sensitive-input refusal without calling the application', async () => {
    const callAction = vi.fn()
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:sensitive', requestRef: 'request:agent:sensitive', agentRef: 'agent:test',
      request: 'Find the cheapest option. Card: 4242 4242 4242 4242; password is synthetic-password.',
    }), { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    expect(response.status).toBe(422)
    expect(callAction).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      kind: 'refused', reason: 'sensitive_information_not_accepted',
      summary: 'Remove payment card and account-secret details before submitting this request.',
      nextAction: 'revise_request',
    })
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
    const resumedResponse = await handleAgentCustomerRequestGet('request:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })
    expect(resumedResponse.status).toBe(200)
    await expect(resumedResponse.json()).resolves.toMatchObject({
      recovery: { state: 'restored', restoredAt: 1_000, workRestarted: false },
    })
    expect((await handleAgentCustomerOptionsPost(request('/options', {
      revision: 1, idempotencyKey: 'prepare:1',
    }), 'request:agent:1', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })).status).toBe(200)
    expect(calls.map(({ name }) => name)).toEqual(['customerRequestApplication:resume', 'customerRequestApplication:compare'])
    const { serviceAuth, ...command } = calls[1]?.args ?? {}
    expect(command).toMatchObject({
      requestRef: 'request:agent:1', revision: 1,
      idempotencyKey: 'prepare:1',
    })
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'compare', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
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
    }), 'request:1', { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })
    expect(response.status).toBe(200)
    const [name, calledArgs] = callAction.mock.calls[0] ?? []
    expect(name).toBe('customerRequestApplication:refine')
    const { serviceAuth, ...command } = calledArgs ?? {}
    expect(command).toMatchObject({
      replacesPriorStatement: 'Arrival before 08:00 is immovable.',
    })
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'refine', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
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
    }), 'request:1', { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ...result,
      navigation: {
        current: `/api/v1/requests/${encodeURIComponent('request:1')}`,
        actions: [{ relation: 'prepare_options', href: `/api/v1/requests/${encodeURIComponent('request:1')}/options` }],
      },
    })
    const [name, calledArgs] = callAction.mock.calls[0] ?? []
    expect(name).toBe('customerRequestApplication:provideFacts')
    const { serviceAuth, ...command } = calledArgs ?? {}
    expect(command).toEqual({
      requestRef: 'request:1', idempotencyKey: 'facts:1', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    })
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'facts', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
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
    }), { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(customerRequestAgentResultSchema.parse(body)).toMatchObject({
      requestRef: 'request:agent:cold',
      navigation: {
        current: `/api/v1/requests/${encodeURIComponent('request:agent:cold')}`,
        actions: [{
          relation: 'answer_clarification',
          method: 'POST',
          href: `/api/v1/requests/${encodeURIComponent('request:agent:cold')}/facts`,
          summary: 'Answer this question to continue the same Request.',
          input: {
            idempotencyKey: '<unique string>', expectedRevision: 1,
            requirementKey: 'lookup_instruction', value: '<typed value>',
          },
        }],
      },
    })
  })

  it('gives a cold agent a safe resume action after a transient write conflict', async () => {
    const callAction = vi.fn(async () => ({
      kind: 'request' as const, requestRef: 'request:agent:retry', revision: 2,
      state: 'needs_attention' as const,
      summary: 'The request changed before it could be recorded. Try again.',
      nextAction: 'retry' as const, missingFields: [], criteria: [], options: [],
    }))
    const response = await handleAgentCustomerRequestPost(request('/api/v1/requests', {
      idempotencyKey: 'submit:retry', requestRef: 'request:agent:retry', agentRef: 'cold-agent',
      request: 'Find a labelled sandbox option.',
    }), { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 })

    expect(response.status).toBe(200)
    const body = await response.json() as { navigation: { actions: unknown[] } }
    expect(body.navigation.actions[0]).toMatchObject({
      relation: 'inspect_progress', method: 'GET',
      href: `/api/v1/requests/${encodeURIComponent('request:agent:retry')}`,
      summary: 'Resume this Request, then follow the latest safe action.',
    })
  })

  it('gives a cold agent the same partial progress and no-retry recovery state as the human view', async () => {
    const callAction = vi.fn(async () => ({
      kind: 'request' as const, requestRef: 'request:agent:partial', revision: 1,
      state: 'outcome_unknown' as const,
      summary: 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.',
      nextAction: 'wait' as const, missingFields: [], criteria: [], options: [],
      businesses: [
        { businessRef: 'business:resolver', name: 'Route Resolver' },
        { businessRef: 'business:quoter', name: 'Route Quoter' },
      ],
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'needs_attention' as const },
        dependencies: {
          completed: [{ step: 1, business: 'Route Resolver' }],
          blocked: [],
        },
      },
      action: {
        state: 'unknown' as const, resolution: 'awaiting_evidence' as const,
        automaticRetry: false as const, observedAt: 1_000,
      },
      activity: {
        actor: 'ae' as const, certainty: 'unknown' as const, updatedAt: 1_000,
        nextCheckAt: 31_000, retry: 'blocked_until_reconciled' as const,
        cancellation: 'too_late_or_unsupported' as const, safeNextAction: 'wait_for_evidence' as const,
      },
    }))

    const response = await handleAgentCustomerRequestGet('request:agent:partial', {
      authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000,
    })
    expect(response.status).toBe(200)
    expect(customerRequestAgentResultSchema.parse(await response.json())).toMatchObject({
      state: 'outcome_unknown',
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'needs_attention' },
        dependencies: {
          completed: [{ step: 1, business: 'Route Resolver' }],
          blocked: [],
        },
      },
      action: { state: 'unknown', automaticRetry: false },
      activity: {
        actor: 'ae', retry: 'blocked_until_reconciled', safeNextAction: 'wait_for_evidence',
      },
      navigation: { actions: [
        { relation: 'inspect_progress', method: 'GET' },
        { relation: 'inspect_evidence', method: 'GET' },
        { relation: 'report_problem', method: 'POST' },
      ] },
    })
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
