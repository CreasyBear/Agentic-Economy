import { createIsomorphicFn } from '@tanstack/react-start'

export const captureRouteException = createIsomorphicFn()
  .client((cause: unknown, context?: Record<string, string>, level?: 'warning' | 'error') => {
    void import('@/lib/observability/sentry.client').then(({ captureClientException }) => {
      captureClientException(cause, context, level)
    }).catch(() => undefined)
  })
  .server((cause: unknown, context?: Record<string, string>, level?: 'warning' | 'error') => {
    void import('@/lib/observability/sentry.server').then(({ captureServerException }) => {
      captureServerException(cause, context, level)
    }).catch(() => undefined)
  })
