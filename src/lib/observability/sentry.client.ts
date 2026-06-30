import * as Sentry from '@sentry/react'
import type { AnyRouter } from '@tanstack/react-router'

import { readObservabilityClientConfig } from '@/lib/observability/config'

let initialized = false

export function initSentryClient(router?: AnyRouter): boolean {
  if (initialized || typeof window === 'undefined') {
    return initialized
  }

  const config = readObservabilityClientConfig()
  if (config.sentryDsn === undefined) {
    return false
  }

  const integrations = [
    ...(router === undefined ? [] : [Sentry.tanstackRouterBrowserTracingIntegration(router)]),
    Sentry.replayIntegration(),
  ]

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    ...(config.release === undefined ? {} : { release: config.release }),
    integrations,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1 : 0,
    beforeSend(event) {
      return scrubSensitiveEvent(event)
    },
  })
  initialized = true
  return true
}

export function captureClientException(error: unknown): void {
  if (!initialized) {
    initSentryClient()
  }

  Sentry.captureException(error)
}

export { Sentry }

function scrubSensitiveEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const queryKeys = ['token', 'secret', 'password', 'email', 'phone']
  const requestUrl = event.request?.url

  if (requestUrl !== undefined && queryKeys.some((key) => requestUrl.toLowerCase().includes(`${key}=`))) {
    return null
  }

  return event
}
