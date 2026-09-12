import type { DegradedReason } from '@/lib/errors'

/**
 * Backend (Convex) counterpart to `degrade()`. `degrade.ts` reports to Sentry
 * via `captureRouteException`, which is built on `createIsomorphicFn` from
 * `@tanstack/react-start`. Convex functions run in a SEPARATE runtime, and
 * `convex/` imports from `src/` (via the `@/` alias and relative `../src/`
 * paths), so any module reachable from `convex/` must not pull in TanStack
 * Start. Per Convex's own error-handling guidance, a CAUGHT incident that
 * does not throw is surfaced via `console.*` and picked up by Convex Log
 * Streaming (Convex's native Sentry integration only reports THROWN
 * exceptions). Hence this zero-dependency variant: no Sentry, no TanStack,
 * no Convex imports — only a type-only import of `DegradedReason`, which
 * erases at build.
 *
 * Degrading is fine, degrading silently is not. Use this instead of a bare
 * `} catch {` in Convex code whenever a caller falls back to a default
 * instead of erroring — it still reports the cause before returning it.
 */
export function degradeBackend<T>(
  cause: unknown,
  fallback: T,
  context: { site: string; reason: DegradedReason },
): T {
  try {
    console.error('[ae.degraded]', JSON.stringify({
      operation: context.site,
      reason: context.reason,
      cause: serializeCause(cause),
    }))
  } catch {
    // Intentional bare catch: the reporting path must never throw or recurse. See tests/imports/bare-catch-ratchet.test.ts.
    // Never let logging failure change control flow.
  }
  return fallback
}

/**
 * Backend counterpart to `captureRouteException` (which is built on
 * `createIsomorphicFn` from `@tanstack/react-start` and dynamically imports
 * `sentry.server`, pulling in `@sentry/node-core`'s Node builtins). Same
 * zero-dependency rule as `degradeBackend`: no Sentry, no TanStack, console
 * only, picked up by Convex Log Streaming.
 */
export function captureBackendException(
  cause: unknown,
  context?: Record<string, string>,
  level: 'warning' | 'error' = 'warning',
): void {
  try {
    console.error('[ae.exception]', JSON.stringify({
      level,
      ...context,
      cause: serializeCause(cause),
    }))
  } catch {
    // Intentional bare catch: the reporting path must never throw or recurse. See tests/imports/bare-catch-ratchet.test.ts.
    // Never let logging failure change control flow.
  }
}

/**
 * Reduces a cause to just its error class name (e.g. `TypeError`,
 * `AbortError`, `SecretPlaneError`) for call sites that sit on a boundary
 * where the underlying cause's `message`/`stack` could echo response content
 * from an external system (a vault, a provider body) that must never reach
 * Convex Log Streaming - see the `#discardBody` comment in
 * `src/modules/secrets/infisical-cloud.ts` for the same principle applied to
 * a raw response body. Pass the RESULT of this (not the original cause) to
 * `captureBackendException`/`degradeBackend` at those sites.
 */
export function boundaryCauseKind(cause: unknown): string {
  return cause instanceof Error ? cause.name : typeof cause
}

function serializeCause(cause: unknown): unknown {
  try {
    if (cause instanceof Error) {
      return { name: cause.name, message: cause.message, stack: cause.stack }
    }
    if (typeof cause === 'string') {
      return cause
    }
    // Guard against circular structures / non-serializable values.
    JSON.stringify(cause)
    return cause
  } catch {
    // Intentional bare catch: the reporting path must never throw or recurse. See tests/imports/bare-catch-ratchet.test.ts.
    try {
      return String(cause)
    } catch {
      // Intentional bare catch: the reporting path must never throw or recurse. See tests/imports/bare-catch-ratchet.test.ts.
      return 'unserializable cause'
    }
  }
}
