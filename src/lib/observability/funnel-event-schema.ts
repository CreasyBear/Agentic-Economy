import { z } from 'zod'

import { ActivationStageValues, FunnelEventTypeValues } from '@/modules/observability/public'

/**
 * Shared with src/modules/observability/funnel.functions.ts (the TanStack
 * server-function entry that validates and forwards funnel events) and
 * src/lib/observability/funnel-event-props.ts (which shapes the PostHog
 * event properties). Kept in its own leaf file so the latter does not need
 * to import the former, whose handler dynamically imports posthog.server.ts
 * which itself needs funnel-event-props.ts.
 */
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
