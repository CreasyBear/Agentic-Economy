import { captureRouteException } from '@/lib/observability/capture-route-exception'
import type { DegradedReason } from '@/lib/errors'

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
  captureRouteException(cause, { degraded: context.site, reason: context.reason }, 'warning')
  return fallback
}
