import { createIsomorphicFn } from '@tanstack/react-start'

export const captureRouteException = createIsomorphicFn()
  .client((cause: unknown, _context?: Record<string, string>) => {
    void import('@/lib/observability/sentry.client').then(({ captureClientException }) => {
      captureClientException(cause)
    }).catch(() => undefined)
  })
  .server((cause: unknown, context?: Record<string, string>) => {
    void import('@/lib/observability/sentry.server').then(({ captureServerException }) => {
      captureServerException(cause, context)
    }).catch(() => undefined)
  })
