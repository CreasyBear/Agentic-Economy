import { describe, expect, it, vi } from 'vitest'

import {
  handleBrowserCustomerRequestFactsPost,
  handleBrowserCustomerRequestMessagePost,
  handleBrowserCustomerRequestPost,
} from '@/lib/server/customer-request-browser-api'
import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestEvidenceGet } from '@/lib/server/customer-request-recovery-api'
import { expectQuarantineWriteFrozen } from '../../helpers/http'

const serviceKey = 'browser-session-service-key-for-unit-tests'

describe('browser Customer Request API', () => {
  it('freezes guest and authenticated write POSTs as RFC 9457', async () => {
    const callAction = vi.fn()
    const submit = await handleBrowserCustomerRequestPost(new Request('https://ae.example/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'submit:guest:1',
        requestRef: 'request:guest:1',
        agentRef: 'web:guest:1',
        request: 'A quiet place for dinner',
        routing: { network: 'ae:public' },
      }),
    }), {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_000,
      randomUUID: () => '018f3f24-8f17-7b72-8b5a-a3d6d6bf35d7',
      tryAuthenticatedSubmit: vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 })),
      callAction,
    })
    await expectQuarantineWriteFrozen(submit, 'customerRequest.run')
    expect(submit.headers.get('set-cookie')).toBeNull()
    expect(callAction).not.toHaveBeenCalled()

    const message = await handleBrowserCustomerRequestMessagePost(new Request(
      'https://ae.example/api/requests/request%3Aguest%3A1/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'refine:guest:1', expectedRevision: 1, message: 'Near Fremantle.',
        }),
      },
    ), 'request:guest:1', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      callAction,
    })
    await expectQuarantineWriteFrozen(message, 'customerRequest.run')

    const facts = await handleBrowserCustomerRequestFactsPost(new Request(
      'https://ae.example/api/requests/request%3Aguest%3A1/facts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'fact:guest:1', expectedRevision: 2,
          requirementKey: 'requirement:area', value: 'Fremantle and nearby suburbs',
        }),
      },
    ), 'request:guest:1', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      callAction,
    })
    await expectQuarantineWriteFrozen(facts, 'customerRequest.run')
  })

  it('does not create a browser session when an authenticated submission is handled first', async () => {
    const response = await handleBrowserCustomerRequestPost(new Request('https://ae.example/api/requests', {
      method: 'POST', body: '{}',
    }), {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      tryAuthenticatedSubmit: async () => Response.json({ kind: 'request' }),
      callAction: vi.fn(),
    })

    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('tombstones resume GET and evidence GET as RFC 9457 410', async () => {
    const inspect = vi.fn()
    const resume = await handleCustomerRequestGet('request:guest:lifecycle', {
      inspect,
    })
    await expectQuarantineWriteFrozen(resume, 'customerRequest.run')
    expect(inspect).not.toHaveBeenCalled()

    const evidenceInspect = vi.fn()
    const evidence = await handleCustomerRequestEvidenceGet(
      new Request('https://ae.example/api/requests/request:guest:lifecycle/evidence'),
      'request:guest:lifecycle',
      { inspect: evidenceInspect },
    )
    await expectQuarantineWriteFrozen(evidence, 'customerRequest.inspectEvidence')
    expect(evidenceInspect).not.toHaveBeenCalled()
  })

  it('fails a tampered browser session closed without reaching the Request action', async () => {
    const callAction = vi.fn()
    const authenticatedFallback = vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 }))
    const response = await handleBrowserCustomerRequestMessagePost(new Request(
      'https://ae.example/api/requests/request%3Aguest/messages',
      {
        method: 'POST', headers: { Cookie: 'ae_request_session=v1.018f3f24-8f17-7b72-8b5a-a3d6d6bf35d7.10000.gTOSOIzOMUdqFAa2Di80VatUT2X1vQ5SpN0VpbY1lMA' }, body: '{}',
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

  it('fails an expired browser session closed without reaching the Request action', async () => {
    const callAction = vi.fn()
    const authenticatedFallback = vi.fn(async () => Response.json({ error: 'missing_auth' }, { status: 401 }))
    const response = await handleBrowserCustomerRequestMessagePost(new Request(
      'https://ae.example/api/requests/request%3Aguest/messages',
      {
        method: 'POST',
        headers: {
          Cookie: 'ae_request_session=v1.018f3f24-8f17-7b72-8b5a-a3d6d6bf35d7.10000.gTOSOIzOMUdqFAa2Di80VatUT2X1vQ5SpN0VpbY1lME',
        },
        body: '{}',
      },
    ), 'request:guest', {
      env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: serviceKey },
      now: () => 10_000 + 86_400_001,
      callAction,
      tryAuthenticatedMessage: authenticatedFallback,
    })

    expect(response.status).toBe(401)
    expect(callAction).not.toHaveBeenCalled()
    expect(authenticatedFallback).toHaveBeenCalledOnce()
  })
})
