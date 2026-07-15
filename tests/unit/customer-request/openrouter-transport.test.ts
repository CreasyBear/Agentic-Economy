import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createOpenRouterCustomerRequestSemanticTransport,
  createOpenRouterCustomerRequestTransport,
} from '@/modules/customer-request/openrouter-transport'

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

  it('sends the strict response schema supplied by the semantic interpreter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"kind":"needs_intent_direction","prompt":"What next?","selections":[]}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestSemanticTransport({ apiKey: 'secret', model: 'model:test' })
    const responseSchema = { name: 'semantic', strict: true, schema: { type: 'object' } }

    await transport.generateJson({
      systemInstruction: 'system', payload: { customerJob: 'Fremantle', capabilities: [] },
      signal: new AbortController().signal, responseSchema,
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      response_format: { type: 'json_schema', json_schema: responseSchema },
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('provider')
  })

  it('fails closed on provider errors and malformed responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('payment required', { status: 402 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({ apiKey: 'secret', model: 'model:test' })
    const input = { systemInstruction: 'system', payload: { customerJob: 'x', knownFacts: {}, knownFactFields: [], capabilities: [] }, signal: new AbortController().signal }

    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_402')
    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_invalid')
  })

  it('retries one transient provider failure and fails closed after bounded exhaustion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"outcome":"ready"}' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({ apiKey: 'secret', model: 'model:test' })
    const input = { systemInstruction: 'system', payload: { customerJob: 'x', knownFacts: {}, knownFactFields: [], capabilities: [] }, signal: new AbortController().signal }

    await expect(transport.generateJson(input)).resolves.toEqual({ content: '{"outcome":"ready"}' })
    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('bounds each attempt so one stalled provider call cannot consume the retry window', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"outcome":"ready"}' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({
      apiKey: 'secret', model: 'model:test', attemptTimeoutMs: 5,
    })

    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: { customerJob: 'x', knownFacts: {}, knownFactFields: [], capabilities: [] },
      signal: new AbortController().signal,
    })).resolves.toEqual({ content: '{"outcome":"ready"}' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refuses an oversized serialized request before network release', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterCustomerRequestTransport({ apiKey: 'secret', model: 'model:test' })

    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: {
        customerJob: 'x'.repeat(1_000_000), knownFacts: {}, knownFactFields: [], capabilities: [],
      },
      signal: new AbortController().signal,
    })).rejects.toThrow('customer_request_interpretation_request_too_large')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
