import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from '../../../tools/release/customer-request-production-smoke'

afterEach(() => vi.restoreAllMocks())

describe('customer Request production smoke entrypoint', () => {
  it('keeps the script as a credential-free front-door wrapper in preflight mode', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(runCustomerRequestProductionSmoke({
      baseUrl: 'https://agentic-economy-phi.vercel.app', facts: {}, fetch, messages: [],
      preflightOnly: true, requestText: 'Find a sandbox option.',
    })).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('front_door_only'))
  })

  it('requires both independently scoped actors and exact deployment identity before the full journey', async () => {
    const base = {
      baseUrl: 'https://ae.example', facts: {}, fetch: vi.fn<typeof globalThis.fetch>(),
      messages: [], preflightOnly: false, requestText: 'Find a sandbox option.',
    }
    await expect(runCustomerRequestProductionSmoke(base)).rejects.toThrow('AE_CUSTOMER_REQUEST_API_KEY is required')
    await expect(runCustomerRequestProductionSmoke({
      ...base, agentApiKey: 'ak_agent',
    })).rejects.toThrow('AE_CUSTOMER_REQUEST_CUSTOMER_SESSION_TOKEN is required')
    await expect(runCustomerRequestProductionSmoke({
      ...base, agentApiKey: 'ak_agent', customerSessionToken: 'sess_customer',
    })).rejects.toThrow('AE_RELEASE_SOURCE_REVISION is required')
  })

  it('reads the cold journey scenario and exact revision coordinates from the environment', () => {
    expect(customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://ae.example/',
      AE_CUSTOMER_REQUEST_API_KEY: 'ak_agent',
      AE_CUSTOMER_REQUEST_CUSTOMER_SESSION_TOKEN: 'sess_customer',
      AE_RELEASE_SOURCE_REVISION: 'a'.repeat(40), AE_RELEASE_DEPLOYMENT_ID: 'dpl_exact',
      AE_CUSTOMER_REQUEST_FACTS_JSON: '{"sandbox.request_context":"Find a sandbox option"}',
      AE_CUSTOMER_REQUEST_MESSAGES_JSON: '["A short answer"]',
    })).toMatchObject({
      baseUrl: 'https://ae.example', agentApiKey: 'ak_agent', customerSessionToken: 'sess_customer',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      facts: { 'sandbox.request_context': 'Find a sandbox option' }, messages: ['A short answer'],
    })
  })
})
