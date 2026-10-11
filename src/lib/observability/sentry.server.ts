import * as Sentry from '@sentry/node'

import { readObservabilityServerConfig } from '@/lib/observability/config'
import { setJourneyReporter, type JourneyOutcomeEvent } from '@/lib/observability/journey'
import { routeExpectedEvent } from '@/lib/observability/expected-events'
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
  if (!config.sentryEnabled || config.sentryDsn === undefined) {
    return false
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    ...(config.release === undefined ? {} : { release: config.release }),
    tracesSampleRate: config.environment === 'production' ? 0.1 : 1,
    beforeSend(event, hint) {
      const safe = sanitizeTelemetryEvent(event)
      return safe === null ? null : routeExpectedEvent(safe, hint, Sentry.addBreadcrumb)
    },
    beforeSendTransaction(event) {
      return sanitizeTelemetryEvent(event)
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeTelemetryEvent(breadcrumb)
    },
  })
  initialized = true
  setJourneyReporter(reportJourneyToSentry)
  return true
}

function reportJourneyToSentry(event: JourneyOutcomeEvent): void {
  const good = event.good ? 'true' : 'false'
  Sentry.metrics.count('ae.journey', 1, {
    attributes: { journey: event.journey, outcome: event.outcome, good },
  })
  if (event.good) return
  Sentry.withScope((scope) => {
    scope.setTag('journey', event.journey)
    scope.setTag('outcome', event.outcome)
    scope.setTag('good', good)
    scope.setLevel('warning')
    Sentry.captureMessage('[ae.journey]')
  })
}

export function captureServerException(
  error: unknown,
  context?: Record<string, string>,
  level?: 'warning' | 'error',
): void {
  try {
    const safeError = sanitizeTelemetryError(error)
    if (!initSentryServer()) return
    const correlationId = currentRequestCorrelationId()
    const enrichedContext = correlationId === undefined
      ? context
      : { ...(context ?? {}), 'ae.request_id': correlationId }
    const safeContext = enrichedContext === undefined
      ? undefined
      : (sanitizeTelemetryValue(enrichedContext) as Record<string, unknown>)
    Sentry.withScope((scope) => {
      if (safeContext !== undefined) {
        for (const [key, value] of Object.entries(safeContext)) {
          scope.setTag(key, String(value))
        }
      }
      if (level !== undefined) scope.setLevel(level)
      Sentry.captureException(safeError)
    })
  } catch {
    // Intentional bare catch: the reporting path must never throw or recurse.
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
    // Intentional bare catch: the reporting path must never throw or recurse.
    return false
  }
}

export { Sentry }

export function countDegraded(site: string): void {
  Sentry.metrics.count('ae.degraded', 1, { attributes: { site } })
}
