import { createClientOnlyFn } from '@tanstack/react-start'

import type { FunnelCaptureInput } from '@/lib/observability/funnel-event-props'

export const captureClientFunnelEventOnClient = createClientOnlyFn((input: FunnelCaptureInput) => {
  void import('@/lib/observability/posthog-browser').then(({ captureClientFunnelEvent }) => {
    captureClientFunnelEvent(input)
  }).catch(() => {})
})

export const captureClientProductEventOnClient = createClientOnlyFn(
  (event: string, properties?: Record<string, unknown>) => {
    void import('@/lib/observability/posthog-browser').then(({ captureClientProductEvent }) => {
      captureClientProductEvent(event, properties)
    }).catch(() => {})
  },
)
