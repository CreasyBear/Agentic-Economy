import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), query: vi.fn(), action: vi.fn(), capture: vi.fn(), requestController: new AbortController() }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let parse: (data: unknown) => unknown = value => value
    const builder = {
      validator: (validator: typeof parse) => { parse = validator; return builder },
      handler: (handler: (input: { data: unknown }) => unknown) => (input?: { data: unknown }) => handler({ data: parse(input?.data) }),
    }
    return builder
  },
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => ({ signal: mocks.requestController.signal }) }))
vi.mock('@/lib/server/convex-source', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/server/convex-source')>(),
  createAuthenticatedSourceTransport: mocks.createTransport,
}))
vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: mocks.capture }))
import { SOURCE_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'
import { createAuthenticatedConvexClient } from '@/lib/server/convex-source'
import { readOwnerActivityPrimaryServer, readOwnerActivityReportsServer } from '@/lib/server/activity.functions'

const range = { periodStartAt: 1000, periodEndAt: 2000 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.requestController = new AbortController()
  mocks.createTransport.mockResolvedValue({ query: mocks.query, action: mocks.action, mutation: vi.fn() })
})
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('Activity composed requests', () => {
  it('composes Calls and Plans with one request-local transport and starts no financial actions', async () => {
    const calls = { page: [], isDone: true, continueCursor: '' }
    const plans = [{ planRef: 'plan:original', state: 'awaiting_approval', nodeCount: 2, approvedTotalAudUnits: '12000000', createdAt: 1 }]
    mocks.query.mockImplementation(async ref => getFunctionName(ref) === 'capabilityPlans:listOwner' ? plans : calls)
    expect(await readOwnerActivityPrimaryServer({ data: range })).toEqual({ kind: 'available', calls, plans })
    expect(mocks.createTransport).toHaveBeenCalledOnce()
    expect(mocks.action).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual([
      'capabilityCallProjections:listOwnerCalls', 'capabilityPlans:listOwner',
    ])
    expect(mocks.query.mock.calls[0]?.[1]).toEqual({ ...range, paginationOpts: { numItems: 50, cursor: null } })
  })

  it('keeps a failed Plan read distinct from an empty Plan history and never hides available Calls', async () => {
    mocks.query.mockImplementation(async ref => {
      if (getFunctionName(ref) === 'capabilityPlans:listOwner') throw new Error('plan_unavailable')
      return { page: [], isDone: true, continueCursor: '' }
    })
    expect(await readOwnerActivityPrimaryServer({ data: range })).toEqual({ kind: 'available', calls: { page: [], isDone: true, continueCursor: '' } })
    expect(mocks.capture).toHaveBeenCalledOnce()
  })

  it('keeps report source codes and successful usage when external spend fails', async () => {
    mocks.query.mockResolvedValue({ kind: 'empty' })
    mocks.action.mockImplementation(async ref => {
      if (getFunctionName(ref) === 'moneyOwnerSpend:readOwnerSpend') return { kind: 'setup_required', code: 'formance_missing' }
      throw new Error('reconciliation_failed')
    })
    expect(await readOwnerActivityReportsServer({ data: range })).toEqual({ usage: { kind: 'empty' },
      spend: { kind: 'setup_required', code: 'formance_missing' }, reconciliation: { kind: 'unavailable', code: 'source_unavailable' } })
    expect(mocks.createTransport).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.action).toHaveBeenCalledTimes(2)
  })

  it('preserves Agent isolation without reading Account Plans, spend, or reconciliation', async () => {
    mocks.query.mockResolvedValueOnce({ page: [], isDone: true, continueCursor: '' }).mockResolvedValueOnce({ kind: 'empty' })
    await readOwnerActivityPrimaryServer({ data: { ...range, principalRef: 'agent:original' } })
    const result = await readOwnerActivityReportsServer({ data: { ...range, principalRef: 'agent:original' } })
    expect(mocks.query.mock.calls[0]?.[1]).toMatchObject({ principalRef: 'agent:original' })
    expect(mocks.query.mock.calls[1]?.[1]).toEqual({ ...range, dimensionKind: 'agent', dimensionRef: 'agent:original' })
    expect(result).toEqual({ usage: { kind: 'empty' }, spend: { kind: 'not_requested' } })
    expect(mocks.action).not.toHaveBeenCalled()
    expect(mocks.createTransport).toHaveBeenCalledTimes(2)
  })

  it('reports oversized windows without authenticating or pretending complete totals', async () => {
    const result = await readOwnerActivityReportsServer({ data: { periodStartAt: 0, periodEndAt: 367 * 86400000 } })
    expect(result).toEqual({ usage: { kind: 'unavailable', code: 'usage_window_too_large' },
      spend: { kind: 'unavailable', code: 'formance_spend_window_too_large' },
      reconciliation: { kind: 'unavailable', code: 'reconciliation_window_too_large' } })
    expect(mocks.createTransport).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('keeps available Calls when a Plan source ignores the end-to-end deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Activity deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    const calls = { page: [], isDone: true, continueCursor: '' }
    mocks.query.mockImplementation(async ref => getFunctionName(ref) === 'capabilityPlans:listOwner'
      ? new Promise(() => {}) : calls)
    const pending = readOwnerActivityPrimaryServer({ data: range })
    await vi.advanceTimersByTimeAsync(SOURCE_READ_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'available', calls })
    expect(mocks.createTransport).toHaveBeenCalledOnce()
    expect(mocks.createTransport.mock.calls[0]?.[0].signal.aborted).toBe(true)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(mocks.capture.mock.calls[0]?.[0]).toMatchObject({ name: 'TimeoutError' })
  })

  it('retains successful usage when the external financial reads never settle', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Activity deadline.', 'TimeoutError')), ms)
      return controller.signal
    })
    mocks.query.mockResolvedValue({ kind: 'empty' })
    mocks.action.mockReturnValue(new Promise(() => {}))
    const pending = readOwnerActivityReportsServer({ data: range })
    await vi.advanceTimersByTimeAsync(SOURCE_READ_TIMEOUT_MS)
    expect(await pending).toEqual({ usage: { kind: 'empty' }, spend: { kind: 'unavailable', code: 'source_unavailable' },
      reconciliation: { kind: 'unavailable', code: 'source_unavailable' } })
    expect(mocks.action).toHaveBeenCalledTimes(2)
    expect(mocks.createTransport).toHaveBeenCalledOnce()
  })

  it('stops waiting for cancelled auth setup and never dispatches late owner reads', async () => {
    let finish!: (transport: unknown) => void
    mocks.createTransport.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const pending = readOwnerActivityPrimaryServer({ data: range })
    mocks.requestController.abort(new DOMException('Request cancelled.', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    finish({ query: mocks.query, action: mocks.action })
    await Promise.resolve()
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.action).not.toHaveBeenCalled()
    expect(mocks.createTransport).toHaveBeenCalledOnce()
  })

  it('bounds response-body settlement even when a read ignores its abort signal', async () => {
    const controller = new AbortController()
    let body!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(new ReadableStream<Uint8Array>({ start(stream) { body = stream } }))
    const pending = awaitBoundedRead(() => response.json(), controller.signal)
    controller.abort(new DOMException('Body deadline.', 'TimeoutError'))
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    // The ignored body can finish later; it cannot change the settled bounded read.
    body.enqueue(new TextEncoder().encode('{"late":true}'))
    body.close()
  })

  it('ends the auth-token wait without materializing authority when the token arrives after cancellation', async () => {
    let resolveToken!: (token: string) => void
    const token = new Promise<string>(resolve => { resolveToken = resolve })
    const fetch = vi.fn<typeof globalThis.fetch>()
    const controller = new AbortController()
    const pending = awaitBoundedRead(signal => createAuthenticatedConvexClient({
      env: { CONVEX_URL: 'https://happy-animal-123.convex.cloud' },
      authObject: { isAuthenticated: true, getToken: () => token }, signal, fetch,
    }), controller.signal)
    controller.abort(new DOMException('Auth deadline.', 'TimeoutError'))
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    resolveToken('late.owner.token')
    await Promise.resolve()
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
  })

})
