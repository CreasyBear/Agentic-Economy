import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type * as Ai from 'ai'
import { z } from 'zod'

import {
  createOpenRouterJsonTransport,
} from '@/modules/customer-request/openrouter-transport'

const aiSdkTestState = vi.hoisted(() => ({
  generateTextCalls: [] as Array<Record<string, unknown>>,
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>()
  return {
    ...actual,
    generateText: new Proxy(actual.generateText, {
      apply(target, thisArg, args) {
        aiSdkTestState.generateTextCalls.push(args[0] as Record<string, unknown>)
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

describe('OpenRouter customer request transport', () => {
  beforeEach(() => {
    aiSdkTestState.generateTextCalls.length = 0
  })

  it('requests one structured object and returns typed model output', async () => {
    const responseSchema = z.strictObject({ outcome: z.string() })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '{"outcome":"ready"}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })

    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: { customerJob: 'Find an option', capabilities: [] },
      signal: new AbortController().signal,
      responseSchema,
    })).resolves.toEqual({ outcome: 'ready' })
    const call = aiSdkTestState.generateTextCalls[0]
    expect(call).toMatchObject({ instructions: 'system' })
    expect(call).not.toHaveProperty('system')

    const request = fetchMock.mock.calls[0]?.[1]
    expect(request?.headers).toMatchObject({ authorization: 'Bearer secret', 'content-type': 'application/json' })
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'model:test', response_format: { type: 'json_schema' }, temperature: 0,
    })
  })

  it('sends the strict response schema supplied by the semantic interpreter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '{"kind":"needs_intent_direction","prompt":"What next?","selections":[]}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })
    const responseSchema = z.strictObject({
      kind: z.string(), prompt: z.string(), selections: z.array(z.unknown()),
    })

    await transport.generateJson({
      systemInstruction: 'system', payload: { customerJob: 'Fremantle', capabilities: [] },
      signal: new AbortController().signal, responseSchema,
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      response_format: { type: 'json_schema' },
      // Every AE model call carries the gateway's standing routing policy.
      provider: { allow_fallbacks: true, require_parameters: true },
    })
  })

  it('bounds reasoning and output for latency-sensitive semantic interpretation', async () => {
    const responseSchema = z.strictObject({
      kind: z.string(), prompt: z.string(), selections: z.array(z.unknown()),
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '{"kind":"needs_intent_direction","prompt":"What next?","selections":[]}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({
      apiKey: 'secret',
      model: 'openai/gpt-5.6-luna',
      reasoningEffort: 'low',
      maximumCompletionTokens: 1_024,
    })

    await transport.generateJson({
      systemInstruction: 'system',
      payload: { customerJob: 'Find an option', capabilities: [] },
      signal: new AbortController().signal,
      responseSchema,
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      reasoning: { effort: 'low', exclude: true },
      max_tokens: 1_024,
    })
  })

  it('fails closed on provider errors and malformed responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('payment required', { status: 402 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })
    const responseSchema = z.strictObject({ outcome: z.string() })
    const input = {
      systemInstruction: 'system',
      payload: { customerJob: 'x', capabilities: [] },
      signal: new AbortController().signal,
      responseSchema,
    }

    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_402')
    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_invalid')
  })

  it('retries one transient provider failure and fails closed after bounded exhaustion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '{"outcome":"ready"}' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })
    const responseSchema = z.strictObject({ outcome: z.string() })
    const input = {
      systemInstruction: 'system',
      payload: { customerJob: 'x', capabilities: [] },
      signal: new AbortController().signal,
      responseSchema,
    }
    await expect(transport.generateJson(input)).resolves.toEqual({ outcome: 'ready' })
    await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
  it('fails with provider timeout when a provider call stalls', async () => {
    const responseSchema = z.strictObject({ outcome: z.string() })
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '{"outcome":"ready"}' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({
      apiKey: 'secret', model: 'model:test', attemptTimeoutMs: 5,
    })
    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: { customerJob: 'x', capabilities: [] },
      signal: new AbortController().signal,
      responseSchema,
    })).rejects.toThrow('customer_request_interpretation_provider_timeout')
  })

  it('refuses an oversized serialized request before network release', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })
    await expect(transport.generateJson({
      systemInstruction: 'system',
      payload: {
        customerJob: 'x'.repeat(1_000_000), capabilities: [],
      },
      signal: new AbortController().signal,
      responseSchema: z.strictObject({ outcome: z.string() }),
    })).rejects.toThrow('customer_request_interpretation_request_too_large')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('routine provider selection-decline stays quiet on the operator channel', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('does not emit provider_declined warn/error for a `length` finish reason, but still rejects provider_invalid', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: '{"outcome":"ready"}' }, finish_reason: 'length' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      vi.stubGlobal('fetch', fetchMock)
      const transport = createOpenRouterJsonTransport({ apiKey: 'secret', model: 'model:test' })
      const responseSchema = z.strictObject({ outcome: z.string() })
      const input = {
        systemInstruction: 'system',
        payload: { customerJob: 'x', capabilities: [] },
        signal: new AbortController().signal,
        responseSchema,
      }

      await expect(transport.generateJson(input)).rejects.toThrow('customer_request_interpretation_provider_invalid')
      expect(warnSpy).not.toHaveBeenCalledWith(
        'customer_request_interpretation_provider_declined', expect.anything(), expect.anything())
      expect(warnSpy).not.toHaveBeenCalledWith(
        'customer_request_interpretation_provider_declined', expect.anything())
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
