import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOpenRouterCustomerRequestTransport } from '@/modules/customer-request/openrouter-transport'

describe('OpenRouter customer request transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests one JSON object and returns only model content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"outcome":"ready"}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({ apiKey: 'secret', model: 'model:test' })

    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: { customerJob: 'Find an option', knownFacts: {}, knownFactFields: [], capabilities: [] },
      signal: new AbortController().signal,
    })).resolves.toEqual({ content: '{"outcome":"ready"}' })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'model:test', response_format: { type: 'json_object' }, temperature: 0,
    })
  })

  it('fails closed on provider errors and malformed responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({ apiKey: 'secret', model: 'model:test' })
    const input = { systemInstruction: 'system', payload: { customerJob: 'x', knownFacts: {}, knownFactFields: [], capabilities: [] }, signal: new AbortController().signal }

    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_503')
    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_invalid')
  })
})
