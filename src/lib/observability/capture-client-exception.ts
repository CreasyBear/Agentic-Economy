import { createClientOnlyFn } from '@tanstack/react-start'

export const captureClientExceptionOnClient = createClientOnlyFn((cause: unknown) => {
  void import('@/lib/observability/sentry.client').then(({ captureClientException }) => {
    captureClientException(cause)
  }).catch(() => undefined)
})
