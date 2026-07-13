import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCustomerRequestProductionSmoke } from '../../../tools/release/customer-request-production-smoke'

afterEach(() => vi.restoreAllMocks())

describe('customer Request production smoke', () => {
  it('runs credential-free discovery and refusal preflight', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke(config(fetch, true))).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('proves replay, preparation, and stateless resume through public HTTP', async () => {
    const ready = view('ready_to_compare', 1, [])
    const options = view('options_ready', 2, [{ provider: 'one' }, { provider: 'two' }])
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(options))
      .mockResolvedValueOnce(Response.json(options))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke(config(fetch, false))).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(7)
    const submitted = JSON.parse(String(fetch.mock.calls[3]?.[1]?.body)) as Record<string, unknown>
    expect(submitted).toMatchObject({ request: 'Compare registered sandbox options.' })
    expect(submitted).not.toHaveProperty('knownFacts')
    expect(submitted).not.toHaveProperty('routing')
    expect(fetch.mock.calls.at(-1)?.[0].toString()).toContain('/api/v1/requests/acceptance%3A')
  })

  it('proves an evidence-bound recommendation survives cold resume', async () => {
    const ready = view('ready_to_compare', 1, [])
    const options = recommendedView(2)
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(options))
      .mockResolvedValueOnce(Response.json(options))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke({
      ...config(fetch, false), expectedOrdering: 'recommended',
    })).resolves.toBeUndefined()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('lowest_maximum_price'))
  })

  it('passes an optional Vercel protection bypass without exposing it in the request body', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke({
      ...config(fetch, true), deploymentProtectionBypass: 'preview-secret',
    })).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(3)
    for (const call of fetch.mock.calls) {
      expect(new Headers(call[1]?.headers).get('x-vercel-protection-bypass')).toBe('preview-secret')
    }
    expect(fetch.mock.calls[2]?.[1]?.body).toBe('{}')
  })

  it('answers customer-semantic clarification through messages before preparing options', async () => {
    const clarification = {
      ...view('needs_information', 1, []),
      nextAction: 'provide_information',
      clarification: {
        kind: 'intent_direction', answerKind: 'natural_language', prompt: 'What are you looking for there?',
      },
    }
    const ready = view('ready_to_compare', 2, [])
    const options = view('options_ready', 3, [{ provider: 'one' }, { provider: 'two' }])
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(clarification))
      .mockResolvedValueOnce(Response.json(clarification))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(options))
      .mockResolvedValueOnce(Response.json(options))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke({
      ...config(fetch, false), requestText: 'Fremantle', messages: ['Somewhere relaxed for lunch.'],
    })).resolves.toBeUndefined()
    expect(fetch.mock.calls[5]?.[0].toString()).toContain('/messages')
    expect(JSON.parse(String(fetch.mock.calls[5]?.[1]?.body))).toMatchObject({
      expectedRevision: 1, message: 'Somewhere relaxed for lunch.',
    })
  })

  it('stops at protected-data review because an external agent cannot grant customer authority', async () => {
    const protectedReview = {
      ...view('needs_authorization', 1, []),
      nextAction: 'review_disclosure',
      disclosureReview: {
        purpose: 'Prepare a comparison', maximumRecipients: 2,
        categories: [{ label: 'Delivery address', classification: 'personal' }],
      },
    }
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests /messages customer_requests:create needs_authorization options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(protectedReview))
      .mockResolvedValueOnce(Response.json(protectedReview))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke(config(fetch, false))).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('CUSTOMER_AUTHORIZATION_REQUIRED'))
  })
})

function config(fetch: typeof globalThis.fetch, preflightOnly: boolean) {
  return {
    baseUrl: 'https://ae.example', apiKey: preflightOnly ? undefined : 'ak_production', facts: {}, fetch,
    deploymentProtectionBypass: undefined, expectedOrdering: undefined,
    messages: [], preflightOnly, requestText: 'Compare registered sandbox options.',
  }
}

function recommendedView(revision: number) {
  const options = [
    { optionRef: 'option:one', provider: 'one' },
    { optionRef: 'option:two', provider: 'two' },
  ]
  return {
    ...view('options_ready', revision, options),
    optionSet: {
      cardinality: 'multiple', optionCount: 2,
      ordering: {
        kind: 'recommended', commercialInfluence: 'none', objective: 'lowest_maximum_price',
        optionRef: 'option:two', evidenceRef: 'inference:price',
        reasons: ['Lowest provider maximum.'], tradeoffs: ['Provider terms still apply.'],
      },
      coverage: {
        evaluated: 2, optionsReceived: 2, unavailable: 0, pending: 0, uncertain: 0,
        businesses: [
          { name: 'One', status: 'option_received', explanation: 'Returned an option.' },
          { name: 'Two', status: 'option_received', explanation: 'Returned an option.' },
        ],
      },
      options,
    },
  }
}

function view(state: 'needs_information' | 'ready_to_compare' | 'options_ready' | 'needs_authorization', revision: number, options: readonly Record<string, unknown>[]) {
  return {
    kind: 'request', requestRef: 'acceptance:test', revision, state,
    summary: 'Compare registered sandbox options.',
    nextAction: state === 'ready_to_compare' ? 'prepare_options' : 'inspect_options',
    missingFields: [], options,
  }
}
