import { createClientOnlyFn } from '@tanstack/react-start'
import type { AnyRouter } from '@tanstack/react-router'
import {
  isTelemetryAllowedForCurrentRoute,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'

let initialized = false

export const bootClientObservability = createClientOnlyFn((router: AnyRouter) => {
  securePrivateRecordLocation(window.location, window.history)
  if (!isTelemetryAllowedForCurrentRoute()) {
    initialized = true
    return
  }
  if (initialized) {
    return
  }

  initialized = true

  void Promise.all([
    import('@/lib/observability/sentry.client'),
    import('@/lib/observability/posthog.client'),
  ]).then(([{ initSentryClient }, { initPostHogClient }]) => {
    initSentryClient(router)
    initPostHogClient(router)
  })
})
