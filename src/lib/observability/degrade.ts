import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { createIsomorphicFn } from '@tanstack/react-start'
import type { DegradedReason } from '@/lib/errors'

/** Counts a degraded fallback on the server (Sentry metric `ae.degraded`); no-op in the browser. */
const countDegradedRoute = createIsomorphicFn()
  .client((_site: string) => undefined)
  .server((site: string) => {
    void import('@sentry/node').then(Sentry => Sentry.metrics.count('ae.degraded', 1, { attributes: { site } })).catch(() => undefined)
  })

/**
 * Degrading is fine, degrading silently is not. Use this instead of a bare
 * `} catch {` whenever a caller falls back to a default instead of erroring —
 * it still reports the cause (as a warning, not an error) before returning.
 */
export function degrade<T>(
  cause: unknown,
  fallback: T,
  context: { site: string; reason: DegradedReason },
): T {
  countDegradedRoute(context.site)
  captureRouteException(cause, { degraded: context.site, reason: context.reason }, 'warning')
  return fallback
}
