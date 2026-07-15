import { describe, expect, it, vi } from 'vitest'

import {
  handleBrowserCustomerRequestFactsPost,
  handleBrowserCustomerRequestMessagePost,
  handleBrowserCustomerRequestPost,
} from '@/lib/server/customer-request-browser-api'
import {
  handleBrowserCustomerRequestCancelPost,
  handleBrowserCustomerRequestConfirmationPost,
  handleBrowserCustomerRequestEvidenceGet,
  handleBrowserCustomerRequestProblemPost,
  handleBrowserCustomerRequestRunPost,
} from '@/lib/server/customer-request-browser-lifecycle-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

const serviceKey = 'browser-session-service-key-for-unit-tests'

describe('browser Customer Request API', () => {
  it('creates a short-lived HttpOnly guest session and submits through the canonical Request action', async () => {
    let captured: Readonly<{ name: string; args: Record<string, unknown> }> | undefined
    const request = new Request('https://ae.example/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'submit:guest:1',
        requestRef: 'request:guest:1',
        agentRef: 'web:guest:1',
        request: 'A quiet place for dinner',
        routing: { network: 'ae:public' },
      }),
    })

    const response = await handleBrowserCustomerRequestPost(request, {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_000,
      randomUUID: () => '018f3f24-8f17-7b72-8b5a-a3d6d6bf35d7',
      tryAuthenticatedSubmit: vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 })),
      callAction: async (name, args) => {
        captured = { name, args }
        return {
          kind: 'request', requestRef: 'request:guest:1', revision: 1,
          state: 'needs_information', summary: 'A quiet place for dinner',
          nextAction: 'provide_information', missingFields: [], options: [],
          clarification: {
            kind: 'intent_direction', prompt: 'Where should AE look?', answerKind: 'natural_language',
          },
        }
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('ae_request_session=')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=86400')
    expect(response.headers.get('set-cookie')).toContain('Secure')
    expect(captured?.name).toBe('customerRequestApplication:submit')

    const { serviceAuth, ...command } = captured?.args ?? {}
    expect(command).toMatchObject({
      requestId: 'request:guest:1',
      delegatedAgentId: 'browser_guest:018f3f24-8f17-7b72-8b5a-a3d6d6bf35d7',
      customerJob: 'A quiet place for dinner',
    })
    await expect(verifyCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'submit',
      command: command as never,
      assertion: serviceAuth as never,
      now: 10_000,
    })).resolves.toBe(true)

    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    let refinement: Record<string, unknown> | undefined
    const followUp = await handleBrowserCustomerRequestMessagePost(new Request(
      'https://ae.example/api/requests/request%3Aguest%3A1/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
        body: JSON.stringify({
          idempotencyKey: 'refine:guest:1', expectedRevision: 1, message: 'Near Fremantle.',
        }),
      },
    ), 'request:guest:1', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_001,
      callAction: async (_name, args) => {
        refinement = args
        return {
          kind: 'request', requestRef: 'request:guest:1', revision: 2,
          state: 'ready_to_compare', summary: 'A quiet place for dinner near Fremantle',
          nextAction: 'prepare_options', missingFields: [], options: [],
        }
      },
    })

    expect(followUp.status).toBe(200)
    const { serviceAuth: refinementAuth, ...refinementCommand } = refinement ?? {}
    expect((refinementAuth as { principalId: string }).principalId)
      .toBe((serviceAuth as { principalId: string }).principalId)
    await expect(verifyCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'refine',
      command: refinementCommand as never,
      assertion: refinementAuth as never,
      now: 10_001,
    })).resolves.toBe(true)

    let factAnswer: Record<string, unknown> | undefined
    const exactFollowUp = await handleBrowserCustomerRequestFactsPost(new Request(
      'https://ae.example/api/requests/request%3Aguest%3A1/facts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie ?? '' },
        body: JSON.stringify({
          idempotencyKey: 'fact:guest:1', expectedRevision: 2,
          requirementKey: 'requirement:area', value: 'Fremantle and nearby suburbs',
        }),
      },
    ), 'request:guest:1', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_002,
      callAction: async (name, args) => {
        expect(name).toBe('customerRequestApplication:provideFacts')
        factAnswer = args
        return {
          kind: 'request', requestRef: 'request:guest:1', revision: 3,
          state: 'ready_to_compare', summary: 'A quiet place near Fremantle',
          nextAction: 'prepare_options', missingFields: [], options: [],
        }
      },
    })

    expect(exactFollowUp.status).toBe(200)
    const { serviceAuth: factAuth, ...factCommand } = factAnswer ?? {}
    expect((factAuth as { principalId: string }).principalId)
      .toBe((serviceAuth as { principalId: string }).principalId)
    expect(factCommand).toMatchObject({
      requirementKey: 'requirement:area', value: 'Fremantle and nearby suburbs',
    })
    await expect(verifyCustomerRequestServiceAssertion({
      key: serviceKey,
      operation: 'facts',
      command: factCommand as never,
      assertion: factAuth as never,
      now: 10_002,
    })).resolves.toBe(true)
  })

  it('does not create a browser session when an authenticated submission succeeds', async () => {
    const response = await handleBrowserCustomerRequestPost(new Request('https://ae.example/api/requests', {
      method: 'POST', body: '{}',
    }), {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      tryAuthenticatedSubmit: async () => Response.json({ kind: 'request' }),
      callAction: vi.fn(),
    })

    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('keeps one guest Request principal through confirmation, action, recovery, and evidence', async () => {
    const calls: Array<Readonly<{ name: string; args: Record<string, unknown> }>> = []
    const options = {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 20_000,
      randomUUID: () => '018f3f24-8f17-7b72-8b5a-a3d6d6bf35d8',
      tryAuthenticatedSubmit: vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 })),
      callAction: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        if (name === 'customerRequestApplication:submit') return {
          kind: 'request' as const, requestRef: 'request:guest:lifecycle', revision: 1,
          state: 'ready_to_compare' as const, summary: 'Find a suitable service',
          nextAction: 'prepare_options' as const, missingFields: [], options: [],
        }
        return { kind: 'refused' as const, reason: 'request_not_found' as const }
      },
    }
    const submitted = await handleBrowserCustomerRequestPost(post('/api/requests', {
      idempotencyKey: 'submit:guest:lifecycle', requestRef: 'request:guest:lifecycle',
      agentRef: 'web:guest:lifecycle', request: 'Find a suitable service', routing: { network: 'ae:public' },
    }), options)
    const cookie = submitted.headers.get('set-cookie')?.split(';')[0] ?? ''
    const requestRef = 'request:guest:lifecycle'

    await handleBrowserCustomerRequestConfirmationPost(post(
      `/api/requests/${requestRef}/confirmation`,
      { revision: 1, routeRef: 'route:guest:1', idempotencyKey: 'confirm:guest:1' },
      cookie,
    ), requestRef, options)
    await handleBrowserCustomerRequestRunPost(post(
      `/api/requests/${requestRef}/run`, { idempotencyKey: 'run:guest:1' }, cookie,
    ), requestRef, options)
    await handleBrowserCustomerRequestCancelPost(post(
      `/api/requests/${requestRef}/cancellation`, { idempotencyKey: 'cancel:guest:1' }, cookie,
    ), requestRef, options)
    await handleBrowserCustomerRequestProblemPost(post(
      `/api/requests/${requestRef}/problems`, {
        idempotencyKey: 'report:guest:1', category: 'incorrect_result', summary: 'This result is incorrect.',
      }, cookie,
    ), requestRef, options)
    await handleBrowserCustomerRequestEvidenceGet(new Request(
      `https://ae.example/api/requests/${requestRef}/evidence`, { headers: { Cookie: cookie } },
    ), requestRef, options)

    const expected = [
      ['customerRequestApplication:submit', 'submit'],
      ['customerRequestApplication:confirmRoute', 'confirm'],
      ['customerRequestApplication:runRoute', 'run'],
      ['customerRequestApplication:cancelRoute', 'cancel'],
      ['customerRequestApplication:reportRouteProblem', 'report'],
      ['customerRequestApplication:exportRouteEvidence', 'evidence'],
    ] as const
    expect(calls.map(({ name }) => name)).toEqual(expected.map(([name]) => name))
    const principals = new Set(calls.map(({ args }) => (
      args.serviceAuth as { principalId: string }
    ).principalId))
    expect([...principals]).toEqual(['browser_guest:018f3f24-8f17-7b72-8b5a-a3d6d6bf35d8'])
    await Promise.all(calls.map(async ({ args }, index) => {
      const { serviceAuth, ...command } = args
      await expect(verifyCustomerRequestServiceAssertion({
        key: serviceKey,
        operation: expected[index]?.[1] ?? 'submit',
        command: command as never,
        assertion: serviceAuth as never,
        now: 20_000,
      })).resolves.toBe(true)
    }))
  })

  it('fails a tampered browser session closed without reaching the Request action', async () => {
    const callAction = vi.fn()
    const authenticatedFallback = vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 }))
    const response = await handleBrowserCustomerRequestMessagePost(new Request(
      'https://ae.example/api/requests/request%3Aguest/messages',
      {
        method: 'POST', headers: { Cookie: 'ae_request_session=v1.tampered.10000.invalid' }, body: '{}',
      },
    ), 'request:guest', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_001,
      callAction,
      tryAuthenticatedMessage: authenticatedFallback,
    })

    expect(response.status).toBe(401)
    expect(callAction).not.toHaveBeenCalled()
    expect(authenticatedFallback).toHaveBeenCalledOnce()
  })
})

function post(path: string, body: unknown, cookie?: string): Request {
  return new Request(`https://ae.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie === undefined ? {} : { Cookie: cookie }) },
    body: JSON.stringify(body),
  })
}
