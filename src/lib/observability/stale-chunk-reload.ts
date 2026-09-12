import { createClientOnlyFn } from '@tanstack/react-start'

import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'

const VITE_STALE_CHUNK_ERROR_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS for',
] as const

export const STALE_CHUNK_RELOAD_COOLDOWN_MS = 60_000
export const STALE_CHUNK_RELOAD_TIMESTAMP_KEY = 'staleChunkReloadTimestamp'
export const SENTRY_IMPORT_TIMEOUT_BEFORE_RELOAD_MS = 2_000
export const SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS = 2_000

type SentryClientModule = {
  captureClientException: (error: unknown) => void
  Sentry: {
    flush: (timeout?: number) => PromiseLike<unknown>
    getClient: () => unknown
  }
}

type StaleChunkReloadOptions = {
  loadSentry?: () => Promise<SentryClientModule>
  now?: () => number
  reload?: () => void
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

const loadSentryClient = createClientOnlyFn(() => import('@/lib/observability/sentry.client'))

export function isViteStaleChunkError(error: unknown): error is Error {
  return error instanceof Error
    && VITE_STALE_CHUNK_ERROR_MESSAGES.some((message) => error.message.includes(message))
}

/**
 * Claims the single automatic stale-chunk reload allowed in this tab's
 * cooldown window. Storage failures block recovery because reloading without
 * a durable claim could trap the page in a reload loop.
 */
export function attemptViteStaleChunkReload(
  error: unknown,
  options: StaleChunkReloadOptions = {},
): boolean {
  if (!isViteStaleChunkError(error)) {
    return false
  }

  const now = options.now?.() ?? Date.now()
  const storage = options.storage ?? window.sessionStorage

  try {
    const storedValue = storage.getItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY)
    const storedTimestamp = storedValue === null || storedValue.length === 0
      ? Number.NaN
      : Number(storedValue)

    if (
      Number.isFinite(storedTimestamp)
      && now - storedTimestamp < STALE_CHUNK_RELOAD_COOLDOWN_MS
    ) {
      return false
    }

    storage.setItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY, String(now))
  } catch (cause) {
    return degrade(cause, false, { site: 'attemptViteStaleChunkReload', reason: 'source_unavailable' })
  }

  const reload = options.reload ?? (() => window.location.reload())
  const loadSentry = options.loadSentry ?? loadSentryClient

  const reloadAfterBoundedSentryFlush = async () => {
    let sentryImportPromise: Promise<SentryClientModule>

    try {
      sentryImportPromise = loadSentry()
    } catch (cause) {
      captureRouteException(cause, { site: 'reloadAfterBoundedSentryFlush' }, 'warning')
      reload()
      return
    }

    let importTimeoutId: ReturnType<typeof setTimeout> | undefined
    const sentryModule = await Promise.race([
      sentryImportPromise.catch(() => null),
      new Promise<null>((resolve) => {
        importTimeoutId = setTimeout(() => resolve(null), SENTRY_IMPORT_TIMEOUT_BEFORE_RELOAD_MS)
      }),
    ])
    clearTimeout(importTimeoutId)

    if (sentryModule !== null) {
      try {
        if (sentryModule.Sentry.getClient() === undefined) {
          sentryModule.captureClientException(error)
        }

        let flushTimeoutId: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          Promise.resolve(sentryModule.Sentry.flush(SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS))
            .catch(() => undefined),
          new Promise<void>((resolve) => {
            flushTimeoutId = setTimeout(resolve, SENTRY_FLUSH_TIMEOUT_BEFORE_RELOAD_MS)
          }),
        ])
        clearTimeout(flushTimeoutId)
      } catch (cause) {
        captureRouteException(cause, { site: 'reloadAfterBoundedSentryFlush' }, 'warning')
        // A synchronous flush failure must not prevent recovery.
      }
    }

    reload()
  }

  void reloadAfterBoundedSentryFlush()
  return true
}
