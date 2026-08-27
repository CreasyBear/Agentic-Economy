import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildProblem } from '@/lib/errors'
import { toastErrorFunnel, toastErrorFunnelClient, type ToastFunnelEmit } from '@/lib/http/toast-error-funnel'
import { FALLBACK_TOAST_COPY } from '@/lib/http/toast-sanitizer'

/** Capture sink standing in for the production event dispatch. */
function captureEmit(): { emitted: string[]; emit: ToastFunnelEmit } {
  const emitted: string[] = []
  return { emitted, emit: (message) => void emitted.push(message) }
}

function failingNext(error: unknown): () => Promise<never> {
  return async () => {
    throw error
  }
}

/** Release the funnel's same-tick suppression window deterministically. */
function collapseTick(): void {
  vi.advanceTimersByTime(0)
}

describe('toastErrorFunnelClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes a plain string failure through as the toast copy', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    await expect(handler({ next: failingNext(new Error('legacy route outage')) })).rejects.toThrow('legacy route outage')
    expect(emitted).toEqual(['legacy route outage'])
    collapseTick()
  })

  it('renders a real problem body as title plus detail only', async () => {
    const { emitted, emit } = captureEmit()
    const problem = buildProblem({
      kind: 'RESOURCE_EXHAUSTED',
      code: 'rate_limited',
      title: 'Request throttled',
      detail: 'Retry after 30 seconds.',
      retryable: true,
    })
    const handler = toastErrorFunnelClient(emit)
    // Raw non-serialized responses reach middleware as new Error(bodyText).
    await expect(handler({ next: failingNext(new Error(JSON.stringify(problem))) })).rejects.toBeInstanceOf(Error)
    expect(emitted).toEqual(['Request throttled. Retry after 30 seconds.'])
    expect(emitted[0]).not.toContain('about:blank')
    expect(emitted[0]).not.toContain('rate_limited')
    expect(emitted[0]).not.toContain('RESOURCE_EXHAUSTED')
    collapseTick()
  })

  it('renders object garbage as the fallback copy with no [object Object] possible', async () => {
    const { emitted, emit } = captureEmit()
    const garbage = { totally: 'unrelated', nested: { deeper: [1, 2] } }
    const handler = toastErrorFunnelClient(emit)
    await expect(handler({ next: failingNext(garbage) })).rejects.toBe(garbage)
    expect(emitted).toEqual([FALLBACK_TOAST_COPY])
    expect(emitted.join('|')).not.toContain('[object Object]')
    collapseTick()
  })

  it('collapses concurrent failures inside one tick to exactly one toast', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    const first = handler({ next: failingNext(new Error('burst one')) })
    const second = handler({ next: failingNext(new Error('burst two')) })
    await Promise.allSettled([first, second])
    expect(emitted).toEqual(['burst one'])
    collapseTick()
  })

  it('surfaces again on a later distinct tick', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    await expect(handler({ next: failingNext(new Error('same reason')) })).rejects.toThrow()
    collapseTick()
    await expect(handler({ next: failingNext(new Error('same reason')) })).rejects.toThrow()
    expect(emitted).toEqual(['same reason', 'same reason'])
    collapseTick()
  })

  it('keeps the success path completely silent and transparent', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    const payload = { ok: true as const }
    const result = await handler({ next: async () => payload })
    expect(result).toBe(payload)
    expect(emitted).toEqual([])
  })

  it('never toasts redirect objects, while still rethrowing them', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    const redirect = Object.assign(new Response(null, { status: 302 }), { options: {} })
    await expect(handler({ next: failingNext(redirect) })).rejects.toBe(redirect)
    expect(emitted).toEqual([])
    collapseTick()
  })

  it('never toasts not-found control objects, while still rethrowing them', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    const notFound = { isNotFound: true as const }
    await expect(handler({ next: failingNext(notFound) })).rejects.toBe(notFound)
    expect(emitted).toEqual([])
    collapseTick()
  })

  it('preserves thrown error identity verbatim for original call sites', async () => {
    const { emitted, emit } = captureEmit()
    const handler = toastErrorFunnelClient(emit)
    const original = new Error('identity check')
    let caught: unknown
    try {
      await handler({ next: failingNext(original) })
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(original)
    expect(emitted).toEqual(['identity check'])
    collapseTick()
  })
})

describe('toastErrorFunnel — production registration shape', () => {
  it('registers as function middleware with a browser-side client handler', () => {
    // createStart(functionMiddleware) only executes `.client` handlers when
    // the middleware type is 'function'; a silent flip to 'request' would
    // detach every RPC failure from the toast path.
    const registration = toastErrorFunnel.options as Readonly<{ type?: string; client?: unknown }>
    expect(registration.type).toBe('function')
    expect(typeof registration.client).toBe('function')
  })
})
