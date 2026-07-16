import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from '../../../tools/release/customer-request-production-smoke'

afterEach(() => vi.restoreAllMocks())

describe('customer Request production smoke entrypoint', () => {
  it('keeps the script as a credential-free front-door wrapper in preflight mode', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests navigation.actions customer_requests:create routes_ready route_confirmed'))
      .mockResolvedValueOnce(new Response('/api/v1/requests navigation.actions customer_requests:create routes_ready route_confirmed'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(runCustomerRequestProductionSmoke({
      baseUrl: 'https://agentic-economy-phi.vercel.app', facts: {}, fetch, messages: [],
      preflightOnly: true, requestText: 'Find a sandbox option.',
    })).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('front_door_only'))
  })

  it('requires one scoped external-agent identity and exact deployment identity before the full journey', async () => {
    const base = {
      baseUrl: 'https://ae.example', facts: {}, fetch: vi.fn<typeof globalThis.fetch>(),
      messages: [], preflightOnly: false, requestText: 'Find a sandbox option.',
    }
    await expect(runCustomerRequestProductionSmoke(base)).rejects.toThrow('AE_CUSTOMER_REQUEST_API_KEY is required')
    await expect(runCustomerRequestProductionSmoke({
      ...base, agentApiKey: 'ak_agent',
    })).rejects.toThrow('AE_RELEASE_SOURCE_REVISION is required')
  })

  it('reads the cold journey scenario and exact revision coordinates from the environment', () => {
    expect(customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://ae.example/',
      AE_CUSTOMER_REQUEST_API_KEY: 'ak_agent',
      AE_RELEASE_SOURCE_REVISION: 'a'.repeat(40), AE_RELEASE_DEPLOYMENT_ID: 'dpl_exact',
      AE_CUSTOMER_REQUEST_FACTS_JSON: '{"sandbox.request_context":"Find a sandbox option"}',
      AE_CUSTOMER_REQUEST_MESSAGES_JSON: '["A short answer"]',
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_CUSTOMER_REQUEST_EXPECTED_STEP_COUNT: '2',
      AE_CUSTOMER_REQUEST_EXPECTED_BUSINESSES_JSON: '["Resolver","Quoter"]',
      AE_CUSTOMER_REQUEST_EXPECTED_RECIPIENTS_JSON:
        '[{"name":"Resolver","purposes":["resolve_request"]},{"name":"Quoter","purposes":["prepare_quote"]}]',
    })).toMatchObject({
      baseUrl: 'https://ae.example', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      facts: { 'sandbox.request_context': 'Find a sandbox option' }, messages: ['A short answer'],
      finish: 'complete',
      expectedRoute: {
        stepCount: 2,
        businesses: ['Resolver', 'Quoter'],
        recipients: [
          { name: 'Resolver', purposes: ['resolve_request'] },
          { name: 'Quoter', purposes: ['prepare_quote'] },
        ],
      },
    })
  })

  it('rejects an unknown finish mode instead of falling back to cancellation', () => {
    expect(() => customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://ae.example',
      AE_CUSTOMER_REQUEST_API_KEY: 'ak_agent',
      AE_CUSTOMER_REQUEST_FINISH: 'compelete',
    })).toThrow('AE_CUSTOMER_REQUEST_FINISH must be cancel, complete, outcome_unknown, or provider_denied')
  })

  it('freezes a complete direct-provider comparison from explicit environment inputs', () => {
    expect(customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: '["https://resolver.example/api","https://quoter.example/api"]',
      AE_DIRECT_PROVIDER_CREDENTIAL: 'provider_credential',
      AE_DIRECT_PREDECLARED_GAIN: 'recoverable_progress',
      AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: '{"currency":"AUD","amountMinor":1000}',
    })).toMatchObject({
      finish: 'complete',
      directBaseline: {
        providerOrigins: ['https://resolver.example/api', 'https://quoter.example/api'],
        credential: 'provider_credential', predeclaredGain: 'recoverable_progress',
        maximumTotalCost: { currency: 'AUD', amountMinor: 1_000 },
      },
    })
  })

  it('fails closed for partial, non-completing, or unsupported direct comparison configuration', () => {
    expect(() => customerRequestProductionSmokeConfigFromEnvironment({
      AE_DIRECT_PROVIDER_ORIGINS_JSON: '["https://resolver.example/api"]',
    })).toThrow('Direct comparison requires complete explicit configuration')
    expect(() => customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_FINISH: 'cancel',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: '["https://resolver.example/api"]',
      AE_DIRECT_PROVIDER_CREDENTIAL: 'provider_credential',
      AE_DIRECT_PREDECLARED_GAIN: 'recoverable_progress',
      AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: '{"currency":"AUD","amountMinor":1000}',
    })).toThrow('Direct comparison requires AE_CUSTOMER_REQUEST_FINISH=complete')
    expect(() => customerRequestProductionSmokeConfigFromEnvironment({
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: '["https://resolver.example/api"]',
      AE_DIRECT_PROVIDER_CREDENTIAL: 'provider_credential',
      AE_DIRECT_PREDECLARED_GAIN: 'faster',
      AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: '{"currency":"AUD","amountMinor":1000}',
    })).toThrow('AE_DIRECT_PREDECLARED_GAIN must be recoverable_progress')
  })

  it('rejects a programmatic cancellation comparison before any hosted or provider call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(runCustomerRequestProductionSmoke({
      baseUrl: 'https://ae.example', agentApiKey: 'ak_agent', expectedRevision: 'a'.repeat(40),
      expectedDeploymentId: 'dpl_exact', facts: {}, fetch, finish: 'cancel', messages: [],
      preflightOnly: false, requestText: 'Find a sandbox option.',
      directBaseline: {
        providerOrigins: ['https://resolver.example/api', 'https://quoter.example/api'],
        credential: 'provider_credential', predeclaredGain: 'recoverable_progress',
        maximumTotalCost: { currency: 'AUD', amountMinor: 1_000 },
      },
    })).rejects.toThrow('Direct comparison requires a completed hosted journey')
    expect(fetch).not.toHaveBeenCalled()

    await expect(runCustomerRequestProductionSmoke({
      baseUrl: 'https://ae.example', agentApiKey: 'ak_agent', expectedRevision: 'a'.repeat(40),
      expectedDeploymentId: 'dpl_exact', facts: {}, fetch, finish: 'complete', messages: [],
      preflightOnly: false, requestText: 'Find a sandbox option.',
      directBaseline: {
        providerOrigins: ['http://resolver.example/api', 'https://quoter.example/api'],
        credential: 'provider_credential', predeclaredGain: 'recoverable_progress',
        maximumTotalCost: { currency: 'AUD', amountMinor: 1_000 },
      },
    })).rejects.toThrow('must contain at least two safe provider origins')
    expect(fetch).not.toHaveBeenCalled()
  })
})
