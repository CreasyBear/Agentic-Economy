/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import {
  attemptViteStaleChunkReload,
  isViteStaleChunkError,
  SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS,
  SENTRY_IMPORT_TIMEOUT_BEFORE_RELOAD_MS,
  STALE_CHUNK_RELOAD_COOLDOWN_MS,
  STALE_CHUNK_RELOAD_TIMESTAMP_KEY,
} from '@/lib/observability/stale-chunk-reload'

const NOW = 1_700_000_000_000

type SentryFlush = (timeout?: number) => PromiseLike<unknown>
type SentryFlushMock = Mock<SentryFlush>

const staleChunkMessages = [
  'Failed to fetch dynamically imported module: /assets/Page.js',
  'error loading dynamically imported module: /assets/Page.js',
  'Importing a module script failed.',
  'Unable to preload CSS for /assets/Page.css',
]

describe('isViteStaleChunkError', () => {
  it.each(staleChunkMessages)('recognizes the Vite failure family in %s', (message) => {
    expect(isViteStaleChunkError(new Error(message))).toBe(true)
  })

  it.each([
    'Some unrelated error',
    'failed to fetch dynamically imported module: /assets/Page.js',
    'Error loading dynamically imported module: /assets/Page.js',
    'Importing a module failed.',
    'Unable to load CSS for /assets/Page.css',
  ])('does not broaden matching to %s', (message) => {
    expect(isViteStaleChunkError(new Error(message))).toBe(false)
  })

  it('does not classify non-Error throws as stale chunks', () => {
    expect(isViteStaleChunkError(staleChunkMessages[0])).toBe(false)
  })
})

describe('attemptViteStaleChunkReload', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function attempt(
    error: unknown,
    reload = vi.fn(),
    loadSentry = () => Promise.resolve(createSentryClientModule().module),
  ) {
    return {
      reload,
      result: attemptViteStaleChunkReload(error, {
        loadSentry,
        now: () => NOW,
        reload,
        storage: window.sessionStorage,
      }),
    }
  }

  function createSentryClientModule({
    hasClient = true,
    flush = vi.fn<SentryFlush>().mockResolvedValue(true),
  }: {
    hasClient?: boolean
    flush?: SentryFlushMock
  } = {}) {
    const captureClientException = vi.fn()

    return {
      captureClientException,
      flush,
      module: {
        captureClientException,
        Sentry: {
          flush,
          getClient: vi.fn(() => hasClient ? {} : undefined),
        },
      },
    }
  }

  it('stores the timestamp and waits for a successful Sentry flush before its one automatic reload', async () => {
    const observedTimestamps: Array<string | null> = []
    const reload = vi.fn(() => {
      observedTimestamps.push(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY))
    })
    let resolveFlush: ((value: boolean) => void) | undefined
    const flush = vi.fn<SentryFlush>(() => new Promise<boolean>((resolve) => {
      resolveFlush = resolve
    }))
    const sentry = createSentryClientModule({ hasClient: false, flush })

    const result = attempt(
      new Error(staleChunkMessages[0]),
      reload,
      () => Promise.resolve(sentry.module),
    )

    expect(result.result).toBe(true)
    await vi.waitFor(() => expect(flush).toHaveBeenCalledWith(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS))
    expect(sentry.captureClientException).toHaveBeenCalledWith(expect.objectContaining({
      message: staleChunkMessages[0],
    }))
    expect(sentry.captureClientException.mock.invocationCallOrder[0]!).toBeLessThan(
      flush.mock.invocationCallOrder[0]!,
    )
    expect(reload).not.toHaveBeenCalled()
    resolveFlush?.(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(flush.mock.invocationCallOrder[0]!).toBeLessThan(reload.mock.invocationCallOrder[0]!)
    expect(observedTimestamps).toEqual([String(NOW)])
  })

  it('does not duplicate capture when the Sentry client already exists', async () => {
    const sentry = createSentryClientModule()
    const { reload, result } = attempt(
      new Error(staleChunkMessages[0]),
      vi.fn(),
      () => Promise.resolve(sentry.module),
    )

    expect(result).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(sentry.captureClientException).not.toHaveBeenCalled()
    expect(sentry.flush).toHaveBeenCalledWith(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS)
  })

  it('suppresses a repeat reload inside the cooldown', async () => {
    const reload = vi.fn()

    expect(attempt(new Error(staleChunkMessages[0]), reload).result).toBe(true)
    expect(attempt(new Error(staleChunkMessages[0]), reload).result).toBe(false)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it.each([
    { age: 1, expected: false, label: 'fresh' },
    { age: STALE_CHUNK_RELOAD_COOLDOWN_MS - 1, expected: false, label: 'just inside' },
    { age: STALE_CHUNK_RELOAD_COOLDOWN_MS, expected: true, label: 'exactly at the boundary' },
    { age: STALE_CHUNK_RELOAD_COOLDOWN_MS + 1, expected: true, label: 'expired' },
  ])('$label timestamp: reload=$expected', async ({ age, expected }) => {
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY, String(NOW - age))

    const { reload, result } = attempt(new Error(staleChunkMessages[1]))

    expect(result).toBe(expected)
    if (expected) {
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    } else {
      expect(reload).not.toHaveBeenCalled()
    }
  })

  it.each(['not-a-timestamp', '', 'Infinity'])(
    'treats invalid stored value %j as no prior reload',
    async (value) => {
      window.sessionStorage.setItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY, value)

      const { reload, result } = attempt(new Error(staleChunkMessages[2]))

      expect(result).toBe(true)
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
      expect(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY)).toBe(String(NOW))
    },
  )

  it('reloads once when the Sentry import rejects', async () => {
    const { reload, result } = attempt(
      new Error(staleChunkMessages[0]),
      vi.fn(),
      () => Promise.reject(new Error('Sentry chunk unavailable')),
    )

    expect(result).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('waits for the bounded import timeout, then reloads exactly once', async () => {
    vi.useFakeTimers()
    const { reload, result } = attempt(
      new Error(staleChunkMessages[0]),
      vi.fn(),
      () => new Promise(() => {}),
    )

    expect(result).toBe(true)
    await vi.advanceTimersByTimeAsync(SENTRY_IMPORT_TIMEOUT_BEFORE_RELOAD_MS - 1)
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(reload).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(SENTRY_IMPORT_TIMEOUT_BEFORE_RELOAD_MS * 2)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('waits for the bounded flush timeout, then reloads exactly once', async () => {
    vi.useFakeTimers()
    const flush = vi.fn<SentryFlush>(() => new Promise(() => {}))
    const sentry = createSentryClientModule({ hasClient: false, flush })
    const { reload, result } = attempt(
      new Error(staleChunkMessages[0]),
      vi.fn(),
      () => Promise.resolve(sentry.module),
    )

    expect(result).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(flush).toHaveBeenCalledWith(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS)
    expect(sentry.captureClientException.mock.invocationCallOrder[0]!).toBeLessThan(
      flush.mock.invocationCallOrder[0]!,
    )
    await vi.advanceTimersByTimeAsync(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS - 1)
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(reload).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS * 2)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads once when Sentry flush rejects', async () => {
    const flush = vi.fn<SentryFlush>().mockRejectedValue(new Error('flush failed'))
    const sentry = createSentryClientModule({ hasClient: false, flush })
    const { reload, result } = attempt(
      new Error(staleChunkMessages[0]),
      vi.fn(),
      () => Promise.resolve(sentry.module),
    )

    expect(result).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(flush).toHaveBeenCalledWith(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS)
    expect(sentry.captureClientException.mock.invocationCallOrder[0]!).toBeLessThan(
      flush.mock.invocationCallOrder[0]!,
    )
    expect(flush.mock.invocationCallOrder[0]!).toBeLessThan(reload.mock.invocationCallOrder[0]!)
  })

  it('does not reload when session storage reads are denied', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('sessionStorage access denied')
      }),
      setItem: vi.fn(),
    }
    const reload = vi.fn()

    const result = attemptViteStaleChunkReload(new Error(staleChunkMessages[0]), {
      now: () => NOW,
      reload,
      storage,
    })

    expect(result).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when session storage writes are denied', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('sessionStorage access denied')
      }),
    }
    const reload = vi.fn()

    const result = attemptViteStaleChunkReload(new Error(staleChunkMessages[0]), {
      now: () => NOW,
      reload,
      storage,
    })

    expect(result).toBe(false)
    expect(storage.setItem).toHaveBeenCalledWith(STALE_CHUNK_RELOAD_TIMESTAMP_KEY, String(NOW))
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not read storage or reload for an ordinary error', () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    }
    const reload = vi.fn()

    const result = attemptViteStaleChunkReload(new Error('Some unrelated error'), {
      now: () => NOW,
      reload,
      storage,
    })

    expect(result).toBe(false)
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})
