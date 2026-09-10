import { createServerFn } from '@tanstack/react-start'

import {
  recordFunnelEventSchema,
  type RecordPublicFunnelEventInput,
} from '@/lib/observability/funnel-event-schema'

export type { RecordPublicFunnelEventInput }

export const recordServerFunnelEventServer = createServerFn({ method: 'POST' })
  .validator((data) => recordFunnelEventSchema.parse(data))
  .handler(async ({ data }) => {
    const { captureServerFunnelEvent } = await import('@/lib/observability/posthog.server')
    const {
      actorRef: _callerShapedActorRef,
      businessId: _callerShapedBusinessId,
      ...publicEvent
    } = data
    captureServerFunnelEvent(publicEvent)
    return { ok: true as const }
  })
