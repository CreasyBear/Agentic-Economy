import { createClientOnlyFn } from '@tanstack/react-start'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

export const captureClientExceptionOnClient = createClientOnlyFn((cause: unknown) => {
  void import('@/lib/observability/sentry.client').then(({ captureClientException }) => {
    captureClientException(cause)
  }).catch((importFailure: unknown) => {
    // The Sentry client chunk itself failed to load - report through the
    // isomorphic reporter (a separate code path with its own guarded
    // dynamic import) instead of discarding the cause.
    captureRouteException(importFailure, { site: 'captureClientExceptionOnClient' }, 'warning')
  })
})
