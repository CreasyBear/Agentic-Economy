import * as Sentry from '@sentry/node'

import { readObservabilityServerConfig } from '@/lib/observability/config'
import {
  sanitizeTelemetryError,
  sanitizeTelemetryEvent,
  sanitizeTelemetryValue,
} from '@/lib/observability/private-route-safety'
import { currentRequestCorrelationId } from '@/lib/server/request-correlation'

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
  try {
    const safeError = sanitizeTelemetryError(error)
    if (!initSentryServer()) return
    const correlationId = currentRequestCorrelationId()
    const enrichedContext = correlationId === undefined
      ? context
      : { ...(context ?? {}), 'ae.request_id': correlationId }
    if (enrichedContext !== undefined) {
      const safeContext = sanitizeTelemetryValue(enrichedContext) as Record<string, unknown>
      Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(safeContext)) {
          scope.setTag(key, String(value))
        }
        Sentry.captureException(safeError)
      })
      return
    }
    Sentry.captureException(safeError)
  } catch {
    // Diagnostics are fail-open and cannot alter the domain response.
  }
}

export type ClientErrorCapture = Readonly<{
  message: string
  name?: string
  stack?: string
  url?: string
  source?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}>

export function captureClientError(input: ClientErrorCapture): boolean {
  try {
    if (!initSentryServer()) return false
    const error = new Error(String(sanitizeTelemetryValue(input.message, 'message')))
    if (input.name !== undefined) error.name = String(sanitizeTelemetryValue(input.name, 'name'))
    if (input.stack !== undefined) error.stack = String(sanitizeTelemetryValue(input.stack, 'stack'))
    const safeError = sanitizeTelemetryError(error)
    const correlationId = currentRequestCorrelationId()
    const context = {
      ...(input.url === undefined ? {} : { url: sanitizeTelemetryValue(input.url, 'url') }),
      ...(input.source === undefined ? {} : { source: sanitizeTelemetryValue(input.source, 'source') }),
      ...(input.metadata === undefined ? {} : { metadata: sanitizeTelemetryValue(input.metadata) }),
      ...(correlationId === undefined ? {} : { correlationId }),
    }
    const safeContext = sanitizeTelemetryValue(context) as Record<string, unknown>
    Sentry.withScope((scope) => {
      scope.setTag('ae.client_error', 'true')
      if (correlationId !== undefined) scope.setTag('ae.request_id', String(sanitizeTelemetryValue(correlationId)))
      scope.setContext('ae.client_error', safeContext)
      Sentry.captureException(safeError)
    })
    return true
  } catch {
    return false
  }
}

export { Sentry }
