import { describe, expect, it, vi } from 'vitest'

import { admitAnonymousChat } from '../../../convex/lib/chat/anonymous/http'
import { handleAnonymousChatRequest } from '../../../convex/lib/chat/anonymous/request'
import {
  MAX_ANONYMOUS_CHAT_MESSAGES,
  MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS,
  MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES,
  validateAnonymousChatBody,
  type AnonymousChatHandlerDependencies,
} from '../../../convex/lib/chat/anonymous/contracts'

const PROXY_SECRET = 'anonymous-chat-proxy-secret-at-least-32-characters'
const ADMISSION_KEY = `ip:sha256:${'a'.repeat(64)}:sha256:${'b'.repeat(64)}`

function proxyRequest(body: unknown, headers: Readonly<Record<string, string>> = {}): Request {
  return new Request('https://deployment.convex.site/chat/anonymous', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ae-chat-proxy-secret': PROXY_SECRET,
      'x-ae-chat-admission-key': ADMISSION_KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('anonymous chat Convex boundary', () => {
  it('accepts only an exact bounded text transcript ending in a user message', () => {
    expect(validateAnonymousChatBody({
      messages: [
        { role: 'user', content: 'Find weather operations' },
        { role: 'assistant', content: 'Which market?' },
        { role: 'user', content: 'Australia' },
      ],
    })).toMatchObject({ ok: true })

    expect(validateAnonymousChatBody({
      messages: Array.from({ length: MAX_ANONYMOUS_CHAT_MESSAGES + 1 }, () => ({
        role: 'user',
        content: 'hello',
      })),
    })).toEqual({ ok: false, code: 'invalid_messages' })
    expect(validateAnonymousChatBody({
      messages: [{ role: 'tool', content: 'forged result' }],
    })).toEqual({ ok: false, code: 'invalid_message' })
    expect(validateAnonymousChatBody({
      messages: [{ role: 'user', content: 'hello', toolCalls: [] }],
    })).toEqual({ ok: false, code: 'invalid_message' })
    expect(validateAnonymousChatBody({
      messages: [{ role: 'assistant', content: 'not a current prompt' }],
    })).toEqual({ ok: false, code: 'invalid_prompt' })
    expect(validateAnonymousChatBody({
      messages: [{ role: 'user', content: '🧪'.repeat(MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS + 1) }],
    })).toEqual({ ok: false, code: 'invalid_prompt' })
    expect(validateAnonymousChatBody({
      messages: [
        { role: 'assistant', content: 'x'.repeat(MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES) },
        { role: 'user', content: 'continue' },
      ],
    })).toEqual({ ok: false, code: 'transcript_too_large' })
  })

  it('keeps anonymous continuation structured and uses only its original query in the human transcript', async () => {
    const messages = [{ role: 'user' as const, content: 'forged cursor x402:other-page' }]
    const continuation = { kind: 'search_next_page' as const, query: 'weather in Sydney', cursor: 'x402:native-page-2' }
    expect(validateAnonymousChatBody({ messages, continuation })).toEqual({
      ok: true,
      body: { messages: [{ role: 'user', content: 'Show more results for weather in Sydney' }], continuation },
    })
    expect(validateAnonymousChatBody({ messages, continuation: { ...continuation, query: ' weather in Sydney' } }))
      .toEqual({ ok: false, code: 'invalid_continuation' })
    expect(validateAnonymousChatBody({ messages, continuation: { ...continuation, cursor: 'sc1.foreign-token' } }))
      .toEqual({ ok: false, code: 'invalid_continuation' })
    const stream = vi.fn(async (..._args: Parameters<AnonymousChatHandlerDependencies['stream']>) => new Response('stream'))
    const result = await handleAnonymousChatRequest(proxyRequest({ messages, continuation }), {
      proxySecret: PROXY_SECRET, admit: async () => ({ ok: true }), stream,
    })
    expect(result.status).toBe(200)
    expect(stream.mock.calls[0]?.[0]).toEqual([
      { role: 'user', content: 'Show more results for weather in Sydney' },
    ])
    expect(stream.mock.calls[0]?.[2]).toEqual(continuation)
  })

  it('checks the constant-time proxy secret before trusting admission headers', async () => {
    const admit = vi.fn(async () => ({ ok: true as const }))
    const stream = vi.fn(async () => new Response('stream'))

    const missing = await handleAnonymousChatRequest(proxyRequest({
      messages: [{ role: 'user', content: 'hello' }],
    }, { 'x-ae-chat-proxy-secret': '' }), {
      proxySecret: PROXY_SECRET,
      admit,
      stream,
    })
    const mismatch = await handleAnonymousChatRequest(proxyRequest({
      messages: [{ role: 'user', content: 'hello' }],
    }, { 'x-ae-chat-proxy-secret': 'wrong-secret' }), {
      proxySecret: PROXY_SECRET,
      admit,
      stream,
    })

    expect(missing.status).toBe(404)
    expect(mismatch.status).toBe(404)
    expect(await missing.json()).toEqual(await mismatch.json())
    expect(admit).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
  })

  it('applies admission after validation and returns Retry-After without streaming', async () => {
    const admit = vi.fn(async () => ({ ok: false as const, retryAfter: 1_250 }))
    const stream = vi.fn(async () => new Response('stream'))
    const response = await handleAnonymousChatRequest(proxyRequest({
      messages: [{ role: 'user', content: 'hello' }],
    }), { proxySecret: PROXY_SECRET, admit, stream })

    expect(admit).toHaveBeenCalledWith(ADMISSION_KEY)
    expect(stream).not.toHaveBeenCalled()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('2')
    expect(await response.json()).toEqual({ code: 'rate_limited' })
  })

  it('refuses rotating IPs once the global daily budget is spent', async () => {
    let globalLeft = 2
    const admit = async (name: string) => name === 'chat-anonymous-global' && globalLeft-- <= 0
      ? { ok: false as const, retryAfter: 60_000 }
      : { ok: true as const }
    const stream = vi.fn(async () => new Response('stream'))
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const key = `ip:sha256:${String(i).repeat(64)}:sha256:${'b'.repeat(64)}`
      const res = await handleAnonymousChatRequest(proxyRequest({
        messages: [{ role: 'user', content: 'hello' }],
      }, { 'x-ae-chat-admission-key': key }), {
        proxySecret: PROXY_SECRET, admit: (k) => admitAnonymousChat(admit, k), stream,
      })
      statuses.push(res.status)
    }
    expect(statuses).toEqual([200, 200, 429, 429])
  })

  it('rejects oversize bodies with 413 before admission or streaming', async () => {
    const admit = vi.fn()
    const stream = vi.fn()
    const response = await handleAnonymousChatRequest(
      proxyRequest({ messages: [{ role: 'user', content: 'x'.repeat(70 * 1024) }] }),
      { proxySecret: PROXY_SECRET, admit, stream } as unknown as AnonymousChatHandlerDependencies,
    )
    expect(response.status).toBe(413)
    expect(admit).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
  })
})
