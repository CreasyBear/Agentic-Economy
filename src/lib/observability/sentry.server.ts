import * as Sentry from '@sentry/node'

import { readObservabilityServerConfig } from '@/lib/observability/config'
import { sanitizeTelemetryEvent, sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'

let initialized = false

export function initSentryServer(): boolean {
  if (initialized) {
    return initialized
  }

  const config = readObservabilityServerConfig()
  if (config.sentryDsn === undefined) {
    return false
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    ...(config.release === undefined ? {} : { release: config.release }),
    tracesSampleRate: config.environment === 'production' ? 0.1 : 1,
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

export function captureServerException(error: unknown, context?: Record<string, string>): void {
  if (!initSentryServer()) {
    return
  }

  if (context !== undefined) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, String(sanitizeTelemetryValue(value, key)))
      }
      Sentry.captureException(error)
    })
    return
  }

  Sentry.captureException(error)
}

export { Sentry }
