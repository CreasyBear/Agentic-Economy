import { createClientOnlyFn } from '@tanstack/react-start'

import type { FunnelCaptureInput } from '@/lib/observability/funnel-event-props'

export const captureClientFunnelEventOnClient = createClientOnlyFn((input: FunnelCaptureInput) => {
  void import('@/lib/observability/posthog.client').then(({ captureClientFunnelEvent }) => {
    captureClientFunnelEvent(input)
  })
})

export const captureClientProductEventOnClient = createClientOnlyFn(
  (event: string, properties?: Record<string, unknown>) => {
    void import('@/lib/observability/posthog.client').then(({ captureClientProductEvent }) => {
      captureClientProductEvent(event, properties)
    })
  },
)
