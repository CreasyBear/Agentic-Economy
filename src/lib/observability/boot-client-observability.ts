import { createClientOnlyFn } from '@tanstack/react-start'
import type { AnyRouter } from '@tanstack/react-router'
import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { readObservabilityClientConfig } from '@/lib/observability/config'
import {
  isTelemetryAllowedForCurrentRoute,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'

let initialized = false

export const bootClientObservability = createClientOnlyFn((router: AnyRouter) => {
  try {
    securePrivateRecordLocation(window.location, window.history)
    if (!isTelemetryAllowedForCurrentRoute()) {
      initialized = true
      return
    }
  } catch (cause) {
    // Privacy protection failed: report only the error kind without enabling telemetry.
    degradeBackend(boundaryCauseKind(cause), undefined, { site: 'bootClientObservability.privacy', reason: 'invalid_response' })
    initialized = true
    return
  }
  if (initialized) {
    return
  }

  initialized = true
  const config = readObservabilityClientConfig()
  if (!config.enabled) return

  void Promise.all([
    config.sentryDsn === undefined ? undefined : import('@/lib/observability/sentry.client').then(({ initSentryClient }) => initSentryClient(router)),
    config.posthogKey === undefined ? undefined : import('@/lib/observability/posthog-browser').then(({ initPostHogClient }) => initPostHogClient(router)),
  ]).catch((cause: unknown) => {
    degradeBackend(boundaryCauseKind(cause), undefined, { site: 'bootClientObservability.init', reason: 'source_unavailable' })
  })
})
