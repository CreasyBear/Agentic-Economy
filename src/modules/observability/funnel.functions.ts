import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { ActivationStageValues, FunnelEventTypeValues } from '@/modules/observability/public'

export const recordFunnelEventSchema = z.object({
  eventType: z.enum(FunnelEventTypeValues),
  source: z.string().trim().min(1).max(120),
  stage: z.enum(ActivationStageValues),
  pseudonymousSessionId: z.string().trim().min(1).max(120),
  correlationId: z.string().trim().min(1).max(120),
  consentFlag: z.boolean(),
  referrer: z.string().trim().max(240).optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  actorRef: z.string().trim().max(120).optional(),
  businessId: z.string().trim().max(120).optional(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})

export type RecordPublicFunnelEventInput = z.infer<typeof recordFunnelEventSchema>

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
