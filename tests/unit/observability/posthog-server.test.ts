import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostHog, PostHogOptions } from 'posthog-node'

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  construct: vi.fn(),
  waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: posthogMocks.waitUntil }))

vi.mock('posthog-node', () => ({
  PostHog: posthogMocks.construct,
}))
let actualClient: PostHog | undefined
let finishTransport: (() => void) | undefined

// Fresh imports isolate the module-level client and constructor-failure cases.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('POSTHOG_KEY', 'phc_test')
  vi.stubEnv('AE_DISABLE_OBSERVABILITY', '')
  posthogMocks.capture.mockReset()
  posthogMocks.waitUntil.mockReset()
  posthogMocks.construct.mockReset().mockImplementation(function () {
    return {
      capture: posthogMocks.capture,
      flush: vi.fn(),
      shutdown: vi.fn(),
    }
  })
})

afterEach(async () => {
  try {
    finishTransport?.()
    await actualClient?.shutdown()
  } finally {
    actualClient = undefined
    finishTransport = undefined
    vi.useRealTimers()
    vi.unstubAllEnvs()
  }
})

describe('PostHog server capture', () => {
  it('does not construct or capture without a PostHog key', async () => {
    vi.stubEnv('POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not construct or capture when observability is disabled', async () => {
    vi.stubEnv('AE_DISABLE_OBSERVABILITY', 'true')
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    captureServerEvent('diagnostic', 'test')

    expect(posthogMocks.construct).not.toHaveBeenCalled()
    expect(posthogMocks.capture).not.toHaveBeenCalled()
  })

  it('does not let constructor exceptions escape', async () => {
    posthogMocks.construct.mockImplementationOnce(function () {
      throw new Error('constructor failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })

  it('does not let capture exceptions escape', async () => {
    posthogMocks.capture.mockImplementationOnce(() => {
      throw new Error('capture failed')
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')

    expect(() => captureServerEvent('diagnostic', 'test')).not.toThrow()
  })

  it('registers the pinned SDK batch with Vercel without waiting in the capture path', async () => {
    vi.useFakeTimers()
    const { PostHog: ActualPostHog } = await vi.importActual<typeof import('posthog-node')>('posthog-node')
    const response = Promise.withResolvers<Response>()
    const fetch = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(new Response(null, { status: 200 }))
    finishTransport = () => response.resolve(new Response(null, { status: 200 }))
    posthogMocks.construct.mockImplementation(function (key: string, options: PostHogOptions) {
      actualClient = new ActualPostHog(key, { ...options, fetch, disableCompression: true })
      return actualClient
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')
    expect(captureServerEvent('diagnostic', 'first')).toBeUndefined()
    expect(captureServerEvent('diagnostic', 'concurrent')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(51)
    expect(fetch).toHaveBeenCalledOnce()
    expect(posthogMocks.waitUntil).toHaveBeenCalledOnce()
    const lifetime = posthogMocks.waitUntil.mock.calls[0]?.[0]
    let complete = false
    void lifetime?.then(() => { complete = true })
    await Promise.resolve()
    expect(complete).toBe(false)
    const request = fetch.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(request.body)) as { batch: { event: string }[] }
    expect(body.batch.map(event => event.event)).toEqual(['first', 'concurrent'])
    response.resolve(new Response(null, { status: 200 }))
    await lifetime
    expect(complete).toBe(true)
    captureServerEvent('diagnostic', 'later request')
    await vi.advanceTimersByTimeAsync(51)
    expect(posthogMocks.waitUntil).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
    await posthogMocks.waitUntil.mock.calls[1]?.[0]
  })

  it('cancels a stalled SDK send after five seconds without transport retries', async () => {
    vi.useFakeTimers()
    const { PostHog: ActualPostHog } = await vi.importActual<typeof import('posthog-node')>('posthog-node')
    const response = Promise.withResolvers<Response>()
    const fetch = vi.fn((_url: string, options?: RequestInit) => {
      options?.signal?.addEventListener('abort', () => response.reject(options.signal?.reason), { once: true })
      return response.promise
    })
    finishTransport = () => {
      response.resolve(new Response(null, { status: 200 }))
      fetch.mockResolvedValue(new Response(null, { status: 200 }))
    }
    posthogMocks.construct.mockImplementation(function (key: string, options: PostHogOptions) {
      actualClient = new ActualPostHog(key, { ...options, fetch, disableCompression: true })
      return actualClient
    })
    const { captureServerEvent } = await import('@/lib/observability/posthog.server')
    expect(captureServerEvent('diagnostic', 'test')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(5_051)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(posthogMocks.waitUntil).toHaveBeenCalledOnce()
    await expect(posthogMocks.waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined()
  })
})
