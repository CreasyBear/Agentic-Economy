import * as Sentry from '@sentry/react'
import type { AnyRouter } from '@tanstack/react-router'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import {
  isTelemetryAllowedForCurrentRoute,
  sanitizeTelemetryError,
  sanitizeTelemetryEvent,
  sanitizeTelemetryValue,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'

let initialized = false

export function initSentryClient(router?: AnyRouter): boolean {
  if (typeof window === 'undefined') return false
  securePrivateRecordLocation(window.location, window.history)
  if (!isTelemetryAllowedForCurrentRoute() || initialized) return initialized

  const config = readObservabilityClientConfig()
  if (config.sentryDsn === undefined) {
    return false
  }

  const integrations = router === undefined
    ? []
    : [Sentry.tanstackRouterBrowserTracingIntegration(router)]

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    ...(config.release === undefined ? {} : { release: config.release }),
    integrations,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    beforeSend(event) {
      return sanitizeTelemetryEvent(event)
    },
    beforeSendTransaction(event) {
      return sanitizeTelemetryEvent(event)
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeTelemetryEvent(breadcrumb)
    },
  })
  initialized = true
  return true
}
export function captureClientException(
  error: unknown,
  context?: Record<string, string>,
  level?: 'warning' | 'error',
): void {
  if (!isTelemetryAllowedForCurrentRoute()) return
  if (!initialized) {
    initSentryClient()
  }

  const safeError = sanitizeTelemetryError(error)
  const safeContext = context === undefined
    ? undefined
    : (sanitizeTelemetryValue(context) as Record<string, unknown>)
  Sentry.withScope((scope) => {
    if (safeContext !== undefined) {
      for (const [key, value] of Object.entries(safeContext)) {
        scope.setTag(key, String(value))
      }
    }
    if (level !== undefined) scope.setLevel(level)
    Sentry.captureException(safeError)
  })
}

export { Sentry }
