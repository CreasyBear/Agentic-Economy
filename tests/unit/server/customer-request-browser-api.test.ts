import { describe, expect, it, vi } from 'vitest'

import {
  handleBrowserCustomerRequestMessagePost,
  handleBrowserCustomerRequestPost,
} from '@/lib/server/customer-request-browser-api'
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
