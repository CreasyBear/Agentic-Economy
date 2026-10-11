/** Pure, dependency-free secret redaction shared by telemetry and backend logging (OWASP Logging Cheat Sheet, CWE-532). */
export const filteredTelemetryValue = '[Filtered]'

const privateKeyPemPattern = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/giu
const authorizationPattern = /(\bAuthorization\b\s*["']?\s*[:=]\s*)(["']?)(Bearer|Basic)\s+([^"'`,;\s]+)\2/giu
const cookieHeaderPattern = /(\b(?:Cookie|Set-Cookie)\b\s*["']?\s*[:=]\s*)[^\r\n]*/giu
const urlUserInfoPattern = /(\bhttps?:\/\/)[^/\s?#@]+(?::[^/\s?#@]*)?@/giu
const secretAssignmentPattern = /(\b(?:[A-Za-z0-9]+[_-])*(?:key|token|secret|password|api[_-]?key|access[_-]?(?:key|token)|client[_-]?secret|user[_-]?code|device[_-]?code|authorization[_-]?code|grant[_-]?ref|oauth[_-]?state|state)\b\s*["']?\s*[:=]\s*)(["']?)([^"'`\s,;&}\]]+)\2/giu
const relativeUrlQueryPattern = /(^|\s)(\/[^\s?#]*)[?#][^\s"'`]*/giu

export function redactShareTokenPath(value: string): string {
  return value.replace(/\/s\/[0-9a-f]{64}(?=\/|[?#\s]|$)/gi, '/s/[Filtered]')
}

export function redactSensitiveText(value: string): string {
  const redacted = value
    .replace(privateKeyPemPattern, (_match: string, label: string) =>
      `-----BEGIN ${label}-----${filteredTelemetryValue}-----END ${label}-----`)
    .replace(
      authorizationPattern,
      (_match: string, prefix: string, quote: string, scheme: string) =>
        `${prefix}${quote}${scheme} ${filteredTelemetryValue}${quote}`,
    )
    .replace(cookieHeaderPattern, (_match: string, prefix: string) => `${prefix}${filteredTelemetryValue}`)
    .replace(relativeUrlQueryPattern, (_match: string, prefix: string, pathname: string) => `${prefix}${pathname}`)
    .replace(urlUserInfoPattern, '$1[Filtered]@')
    .replace(/([?&]code=)[^&\s"'`#]+/giu, '$1[Filtered]')
    .replace(
      secretAssignmentPattern,
      (_match: string, prefix: string, quote: string) => `${prefix}${quote}${filteredTelemetryValue}${quote}`,
    )
    .replace(
      /([?&#]|\b)(k|access|accessKey|accessToken|token|secret|password|email|phone)=([^&#\s]*)/gi,
      (_match: string, prefix: string, name: string) => `${prefix}${name}=${filteredTelemetryValue}`,
    )
  return redactShareTokenPath(redacted)
}


/** Canonical reasons a degraded (fallback-served) result can occur. */
export type DegradedReason = 'source_unavailable' | 'timeout' | 'not_found' | 'forbidden' | 'invalid_response'

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
 * no Convex imports — only a local `DegradedReason` type.
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
    // Intentional bare catch: the reporting path must never throw or recurse.
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
    // Intentional bare catch: the reporting path must never throw or recurse.
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
      return {
        name: cause.name,
        message: redactSensitiveText(cause.message),
        stack: cause.stack === undefined ? undefined : redactSensitiveText(cause.stack),
      }
    }
    if (typeof cause === 'string') {
      return redactSensitiveText(cause)
    }
    // Guard against circular structures / non-serializable values.
    const json = JSON.stringify(cause)
    return json === undefined ? undefined : redactSensitiveText(json)
  } catch {
    // Intentional bare catch: the reporting path must never throw or recurse.
    try {
      return redactSensitiveText(String(cause))
    } catch {
      // Intentional bare catch: the reporting path must never throw or recurse.
      return 'unserializable cause'
    }
  }
}
