import { createClientOnlyFn } from '@tanstack/react-start'
import type { AnyRouter } from '@tanstack/react-router'

let initialized = false

export const bootClientObservability = createClientOnlyFn((router: AnyRouter) => {
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
