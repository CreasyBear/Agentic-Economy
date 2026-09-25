import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../../../tools/ae/cli'

const turnRef = `turn_${'0'.repeat(8)}-${'0'.repeat(4)}-4000-8000-${'0'.repeat(12)}`
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
const origin = 'https://ae.example'
const initial = { kind: 'turn', turnRef, contextId: 'thread_test', sequence: 1, state: 'working', eventId: `${turnRef}:1`, correlationId: 'request_test' }
const state = (value: string) => ({ ...initial, state: value, sequence: 2, eventId: `${turnRef}:2` })
const part = (type: string, data: unknown) => ({ type, data })
const sse = (...parts: object[]) => `${parts.map(value => `data: ${JSON.stringify(value)}\n\n`).join('')}data: [DONE]\n\n`
const stream = (...parts: object[]) => new Response(sse(...parts), { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } })

const originalEnv = { ...process.env }
afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...originalEnv }
})
function credentials() {
  process.env.AE_API_KEY = 'test-key'
  process.env.AE_API_KEY_ORIGIN = origin
  process.env.AE_CONFIG_DIR = `/tmp/ae-chat-test-${crypto.randomUUID()}`
}

describe('ae chat and journey status', () => {
  it('emits pure NDJSON with start first, receipt payment and finish last', async () => {
    credentials()
    vi.stubGlobal('fetch', vi.fn(async () => stream(
      part('data-ae-state', initial),
      { type: 'text-delta', id: 'text_1', delta: 'Answer' },
      { type: 'tool-input-available', toolCallId: 'tool_1', toolName: 'registry.tools.search', input: { query: 'weather' } },
      { type: 'tool-output-available', toolCallId: 'tool_1', output: { kind: 'matched' } },
      part('data-ae-quote', { quoteRef: `operation-commitment:v1:${'b'.repeat(64)}`, maxSpendAud: '2.50', expiresAt: 1800000000000 }),
      part('data-ae-receipt', { kind: 'call', callRef, payment: 'paid', state: 'completed', sequence: 3, eventId: 'receipt', correlationId: 'request_test' }),
      part('data-ae-state', state('completed')),
    )))
    const result = await runCli(['chat', 'weather', '--json', '--base-url', origin])
    expect(result.status).toBe(0)
    const events = result.stdout.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(events.map(({ type }) => type)).toEqual(['start', 'text-delta', 'tool-call', 'tool-result', 'quote', 'receipt', 'state', 'finish'])
    expect(events[0]).toMatchObject({ turnRef, threadId: 'thread_test' })
    expect(events[2]).toMatchObject({ toolName: 'registry.tools.search', payload: { query: 'weather' } })
    expect(events[3]).toMatchObject({ toolName: 'registry.tools.search', payload: { kind: 'matched' } })
    expect(events[5]).toMatchObject({ callRef, payment: 'paid' })
    expect(events.at(-1)).toMatchObject({ turnRef, state: 'completed' })
  })

  it('renders streamed text and compact Tool, Quote and receipt lines in human mode', async () => {
    credentials()
    vi.stubGlobal('fetch', vi.fn(async () => stream(
      part('data-ae-state', initial),
      { type: 'tool-input-available', toolCallId: 'tool_1', toolName: 'registry.tools.search', input: {} },
      { type: 'tool-output-available', toolCallId: 'tool_1', output: { kind: 'matched' } },
      { type: 'text-delta', id: 'text_1', delta: 'Answer' },
      part('data-ae-quote', { quoteRef: `operation-commitment:v1:${'b'.repeat(64)}`, maxSpendAud: '2.50', expiresAt: 1800000000000 }),
      part('data-ae-receipt', { kind: 'call', callRef, payment: 'paid' }),
      part('data-ae-state', state('completed')),
    )))
    const result = await runCli(['chat', 'weather', '--base-url', origin])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Tool: registry.tools.search')
    expect(result.stdout).toContain('Tool result: registry.tools.search')
    expect(result.stdout).toContain('Answer')
    expect(result.stdout).toContain('AUD 2.50')
    expect(result.stdout).toContain(`Call ${callRef}: payment paid`)
  })

  it('reuses one clientTurnId on a failed network attempt', async () => {
    credentials()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      requests.push(String(init.body))
      if (requests.length === 1) throw new TypeError('fetch failed')
      return stream(part('data-ae-state', initial), part('data-ae-state', state('completed')))
    }))
    expect((await runCli(['chat', 'hello', '--json', '--base-url', origin])).status).toBe(0)
    expect(requests).toHaveLength(2)
    expect(JSON.parse(requests[0]!) as object).toEqual(JSON.parse(requests[1]!) as object)
    expect(JSON.parse(requests[0]!) as { clientTurnId: string }).toHaveProperty('clientTurnId', expect.any(String))
  })

  it('maps the stream problem to error last with a validated same-Call status continuation', async () => {
    credentials()
    vi.stubGlobal('fetch', vi.fn(async () => stream(
      part('data-ae-state', initial),
      part('data-ae-problem', {
        type: 'about:blank', title: 'Unknown Call outcome', status: 409, kind: 'FAILED_PRECONDITION', code: 'outcome_unknown',
        retryable: true, requestId: 'request_test', next: [
          { action: 'status', args: { ref: { kind: 'call', ref: callRef } }, authority: 'same_principal' },
          { action: 'connect', args: { via: 'oauth_device', url: 'https://evil.example/steal' }, authority: 'human_owner' },
        ],
      }),
    )))
    const result = await runCli(['chat', 'hello', '--json', '--base-url', origin])
    expect(result.status).not.toBe(0)
    const events = result.stdout.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(events.map(({ type }) => type)).toEqual(['start', 'error'])
    expect(events[1]).toMatchObject({ problem: { code: 'outcome_unknown', next: [{ action: 'status', args: { ref: { kind: 'call', ref: callRef } } }] } })
  })

  it('continues the last origin-bound thread without creating a different thread id', async () => {
    credentials()
    const requests: Array<{ prompt: string; threadId?: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)) as { prompt: string; threadId?: string })
      return stream(part('data-ae-state', initial), part('data-ae-state', state('completed')))
    }))
    expect((await runCli(['chat', 'first', '--json', '--base-url', origin])).status).toBe(0)
    expect((await runCli(['chat', 'again', '--continue', '--json', '--base-url', origin])).status).toBe(0)
    expect(requests).toMatchObject([{ prompt: 'first' }, { prompt: 'again', threadId: 'thread_test' }])
    expect(requests[0]).not.toHaveProperty('threadId')
  })

  it('issues DELETE after Ctrl-C for a known Turn', async () => {
    credentials()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push(`${init.method} ${url}`)
      if (init.method === 'DELETE') return Response.json({ kind: 'in_flight', turnRef, inFlightEffects: [{ callRef }] })
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse(part('data-ae-state', initial)).replace('data: [DONE]\n\n', '')))
          init.signal?.addEventListener('abort', () => controller.close(), { once: true })
          // Exercise the real SIGINT handler after the asynchronous parser accepts the first frame.
          setTimeout(() => process.emit('SIGINT'), 10)
        },
      })
      return new Response(body, { headers: { 'x-vercel-ai-ui-message-stream': 'v1' } })
    }))
    const result = await runCli(['chat', 'hello', '--json', '--base-url', origin])
    expect(result.status).not.toBe(0)
    expect(requests).toContain(`DELETE ${origin}/api/v1/chat/turns/${turnRef}`)
    expect(result.stdout.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>).at(-1)).toMatchObject({ type: 'error', problem: { code: 'chat_cancel_in_flight' }, stopped: 'in_flight', inFlightEffects: [{ callRef }] })
  })

  it('reads journey status from the common GET and validates next actions', async () => {
    credentials()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ kind: 'turn', ref: turnRef, workState: 'working', principalRef: `prn_${'a'.repeat(32)}`, next: [
      { action: 'status', args: { ref: { kind: 'turn', ref: turnRef } }, authority: 'same_principal' },
    ] })))
    const result = await runCli(['status', turnRef, '--json', '--base-url', origin])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'turn', workState: 'working', next: [{ action: 'status' }] })
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${origin}/api/v1/status/${turnRef}`)
  })
  it.each([
    { principalRef: 'agent', ref: turnRef, expected: 'malformed at principalRef' },
    { principalRef: `prn_${'a'.repeat(32)}`, ref: `turn_${'1'.repeat(8)}-${'0'.repeat(4)}-4000-8000-${'0'.repeat(12)}`, expected: 'does not match the requested ref' },
  ])('distinguishes malformed status from a different reference: $expected', async ({ principalRef, ref, expected }) => {
    credentials()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      kind: 'turn', ref, principalRef, workState: 'working', next: [],
    })))
    const result = await runCli(['status', turnRef, '--json', '--base-url', origin])
    expect(result.status).not.toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ detail: expect.stringContaining(expected) })
  })
  it('requires buyer authority even for Tool status and points anonymous readers to describe', async () => {
    credentials()
    delete process.env.AE_API_KEY
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const result = await runCli(['status', toolRef, '--json', '--base-url', origin])
    expect(result.status).not.toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'UNAUTHENTICATED', suggestion: expect.stringContaining(`ae describe ${toolRef}`),
    })
    expect(request).not.toHaveBeenCalled()
  })
})
