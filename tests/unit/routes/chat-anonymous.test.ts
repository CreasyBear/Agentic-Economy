import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  handleAnonymousChatProxyRequest,
  resolveAnonymousChatSiteUrl,
  Route,
} from '../../../src/routes/api.chat.anonymous'
import { requestAdmissionKey } from '../../../src/lib/server/rate-limit'

const PROXY_SECRET = 'anonymous-chat-proxy-secret-at-least-32-characters'
const body = { messages: [{ role: 'user', content: 'Find weather operations' }] }

function request(input: Readonly<{
  method?: string
  body?: BodyInit | null
  contentType?: string
  signal?: AbortSignal
}> = {}): Request {
  return new Request('https://agentic.example/api/chat/anonymous', {
    method: input.method ?? 'POST',
    headers: {
      ...(input.contentType === undefined
        ? { 'Content-Type': 'application/json' }
        : input.contentType.length === 0 ? {} : { 'Content-Type': input.contentType }),
      'X-AE-Request-Id': 'chat_request_1',
      'CF-Connecting-IP': '203.0.113.10',
    },
    ...(input.body === null ? {} : { body: input.body ?? JSON.stringify(body) }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
}

describe('anonymous chat TanStack proxy', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses an explicit site URL before the cloud deployment fallback', () => {
    expect(resolveAnonymousChatSiteUrl({
      CONVEX_SITE_URL: 'https://explicit.convex.site',
      CONVEX_URL: 'https://fallback.convex.cloud',
    })).toBe('https://explicit.convex.site')
    expect(resolveAnonymousChatSiteUrl({
      CONVEX_URL: 'https://happy-animal-123.convex.cloud',
    })).toBe('https://happy-animal-123.convex.site')
    expect(resolveAnonymousChatSiteUrl({
      CONVEX_URL: 'https://not-convex.example',
    })).toBeUndefined()
    expect(resolveAnonymousChatSiteUrl({
      CONVEX_SITE_URL: 'javascript:alert(1)',
      CONVEX_URL: 'https://fallback.convex.cloud',
    })).toBeUndefined()
  })

  it('forwards the hashed admission identity, abort signal, and unbuffered safe stream', async () => {
    const controller = new AbortController()
    const incoming = request({ signal: controller.signal })
    const source = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode('data: {"type":"start"}\n\n'))
        streamController.close()
      },
    })
    let fetchInput: URL | RequestInfo | undefined
    let fetchInit: RequestInit | undefined
    const fetch: typeof globalThis.fetch = async (input, init) => {
      fetchInput = input
      fetchInit = init
      return new Response(source, {
        status: 202,
        headers: {
          'Content-Type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
          'x-accel-buffering': 'no',
          'Set-Cookie': 'must-not-leak=true',
          'X-Internal-Secret': 'must-not-leak',
        },
      })
    }
    const admit = vi.fn(async () => ({ ok: true as const }))

    const response = await handleAnonymousChatProxyRequest(incoming, {
      env: {
        CONVEX_SITE_URL: 'https://happy-animal-123.convex.site',
        AE_CHAT_PROXY_SECRET: PROXY_SECRET,
      },
      fetch,
      admit,
    })

    expect(admit).toHaveBeenCalledWith(incoming, 'chat-anonymous')
    expect(fetchInput).toBe('https://happy-animal-123.convex.site/chat/anonymous')
    expect(fetchInit?.signal).toBe(incoming.signal)
    expect(new Headers(fetchInit?.headers).get('x-ae-chat-proxy-secret')).toBe(PROXY_SECRET)
    expect(new Headers(fetchInit?.headers).get('x-ae-chat-admission-key')).toBe(
      requestAdmissionKey(incoming, 'chat-anonymous'),
    )
    expect(JSON.parse(String(fetchInit?.body))).toEqual(body)
    expect(response.status).toBe(202)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('x-internal-secret')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBe('chat_request_1')
    expect(await response.text()).toBe('data: {"type":"start"}\n\n')
  })

  it('returns stable method, content, body, rate, and configuration failures', async () => {
    const handlers = Route.options.server?.handlers
    const get = typeof handlers === 'object' && handlers !== null && 'GET' in handlers
      ? handlers.GET
      : undefined
    if (typeof get !== 'function') throw new Error('GET handler missing')
    const methodResponse = await get({ request: request({ method: 'GET', body: null }) } as never)
    if (!(methodResponse instanceof Response)) throw new Error('GET response missing')
    expect(methodResponse.status).toBe(405)
    expect(methodResponse.headers.get('allow')).toBe('POST')

    const invalidContent = await handleAnonymousChatProxyRequest(request({ contentType: 'text/plain' }))
    expect(invalidContent.status).toBe(415)
    expect(await invalidContent.json()).toMatchObject({ code: 'invalid_content_type' })

    const invalidJson = await handleAnonymousChatProxyRequest(request({ body: '{' }))
    expect(invalidJson.status).toBe(400)
    expect(await invalidJson.json()).toMatchObject({ code: 'invalid_json' })

    const tooLarge = await handleAnonymousChatProxyRequest(request({
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(19 * 1024) }] }),
    }))
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toMatchObject({ code: 'payload_too_large' })

    const missingConfigFetch = vi.fn()
    const missingConfig = await handleAnonymousChatProxyRequest(request(), {
      env: {},
      fetch: missingConfigFetch as typeof globalThis.fetch,
    })
    expect(missingConfig.status).toBe(503)
    expect(await missingConfig.json()).toMatchObject({ code: 'chat_proxy_unavailable' })
    expect(missingConfigFetch).not.toHaveBeenCalled()

    const limited = await handleAnonymousChatProxyRequest(request(), {
      env: {
        CONVEX_SITE_URL: 'https://happy-animal-123.convex.site',
        AE_CHAT_PROXY_SECRET: PROXY_SECRET,
      },
      admit: async () => ({ ok: false, retryAfter: 1_001 }),
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('2')
  })
})
