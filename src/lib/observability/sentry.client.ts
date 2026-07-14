import * as Sentry from '@sentry/react'
import type { AnyRouter } from '@tanstack/react-router'

import { readObservabilityClientConfig } from '@/lib/observability/config'
import {
  isTelemetryAllowedForCurrentRoute,
  sanitizeTelemetryEvent,
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

export function captureClientException(error: unknown): void {
  if (!isTelemetryAllowedForCurrentRoute()) return
  if (!initialized) {
    initSentryClient()
  }

  Sentry.captureException(error)
}

export { Sentry }
