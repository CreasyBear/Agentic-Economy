import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCustomerRequestProductionSmoke } from '../../../tools/release/customer-request-production-smoke'

afterEach(() => vi.restoreAllMocks())

describe('customer Request production smoke', () => {
  it('runs credential-free discovery and refusal preflight', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests customer_requests:create options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests customer_requests:create options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke(config(fetch, true))).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('proves replay, preparation, and stateless resume through public HTTP', async () => {
    const ready = view('ready_to_compare', 1, [])
    const options = view('options_ready', 2, [{ provider: 'one' }, { provider: 'two' }])
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('/api/v1/requests customer_requests:create options_ready'))
      .mockResolvedValueOnce(new Response('/api/v1/requests customer_requests:create options_ready'))
      .mockResolvedValueOnce(Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(ready))
      .mockResolvedValueOnce(Response.json(options))
      .mockResolvedValueOnce(Response.json(options))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(runCustomerRequestProductionSmoke(config(fetch, false))).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(7)
    expect(fetch.mock.calls.at(-1)?.[0].toString()).toContain('/api/v1/requests/acceptance%3A')
  })
})

function config(fetch: typeof globalThis.fetch, preflightOnly: boolean) {
  return {
    baseUrl: 'https://ae.example', apiKey: preflightOnly ? undefined : 'ak_production', facts: {}, fetch,
    preflightOnly, requestText: 'Compare registered sandbox options.',
  }
}

function view(state: 'ready_to_compare' | 'options_ready', revision: number, options: readonly Record<string, unknown>[]) {
  return {
    kind: 'request', requestRef: 'acceptance:test', revision, state,
    summary: 'Compare registered sandbox options.',
    nextAction: state === 'ready_to_compare' ? 'prepare_options' : 'inspect_options',
    missingFields: [], options,
  }
}
