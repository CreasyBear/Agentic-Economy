import { loadSentryClient } from '@/lib/observability/load-sentry-client'
import { toast } from 'sonner'
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

const loadSentryClientOnly = createClientOnlyFn(() => loadSentryClient())

export function isViteStaleChunkError(error: unknown): error is Error {
  return error instanceof Error
    && VITE_STALE_CHUNK_ERROR_MESSAGES.some((message) => error.message.includes(message))
}

const CONVEX_SKEW_ERROR_MESSAGES = [
  'Could not find public function',
  'ArgumentValidationError',
  'Object is missing the required field',
] as const

export function isConvexSkewError(error: unknown): error is Error {
  return error instanceof Error
    && CONVEX_SKEW_ERROR_MESSAGES.some((message) => `${error.name}: ${error.message}`.includes(message))
}

/** Claims the one action allowed per tab cooldown window; storage failure blocks it to avoid loops. */
function claimReloadSlot(options: StaleChunkReloadOptions, site: string): boolean {
  const now = options.now?.() ?? Date.now()

  try {
    const storage = options.storage ?? window.sessionStorage
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
    return true
  } catch (cause) {
    return degrade(cause, false, { site, reason: 'source_unavailable' })
  }
}

/** Client/backend version skew: a non-blocking reload prompt, once per cooldown window. */
export function promptConvexSkewReload(
  error: unknown,
  options: StaleChunkReloadOptions & { notify?: typeof toast.message } = {},
): boolean {
  if (!isConvexSkewError(error) || !claimReloadSlot(options, 'promptConvexSkewReload')) {
    return false
  }
  const reload = options.reload ?? (() => window.location.reload())
  ;(options.notify ?? toast.message)('A new version is available', {
    duration: Infinity,
    action: { label: 'Reload', onClick: reload },
  })
  return true
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

  if (!claimReloadSlot(options, 'attemptViteStaleChunkReload')) {
    return false
  }

  const reload = options.reload ?? (() => window.location.reload())
  const loadSentry = options.loadSentry ?? loadSentryClientOnly

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
