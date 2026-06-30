import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callPublicSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
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
  claimId: z.string().trim().max(120).optional(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})

const recordOwnerActivationEventMutation = sourceMutation<z.infer<typeof recordFunnelEventSchema>, { ok: true }>(
  'observability:recordOwnerActivationEvent',
)

const readAdminOwnerActivationSummaryQuery = sourceQuery<
  Record<string, never>,
  {
    byStage: readonly { stage: string; count: number }[]
    totalTracked: number
  }
>('observability:readAdminOwnerActivationSummary')

export type RecordPublicFunnelEventInput = z.infer<typeof recordFunnelEventSchema>

export async function recordOwnerActivationThroughSource(input: RecordPublicFunnelEventInput): Promise<void> {
  const parsed = recordFunnelEventSchema.parse(input)
  if (parsed.businessId === undefined) {
    return
  }

  await callPublicSourceMutation(recordOwnerActivationEventMutation, parsed)
}

export async function readAdminOwnerActivationSummaryThroughSource() {
  return callSourceQuery(readAdminOwnerActivationSummaryQuery, {})
}

export const recordOwnerActivationEventServer = createServerFn({ method: 'POST' })
  .validator((data) => recordFunnelEventSchema.parse(data))
  .handler(async ({ data }) => {
    await recordOwnerActivationThroughSource(data)
    return { ok: true as const }
  })

export const recordServerFunnelEventServer = createServerFn({ method: 'POST' })
  .validator((data) => recordFunnelEventSchema.parse(data))
  .handler(async ({ data }) => {
    const { recordServerFunnelEventThroughSource } = await import('@/modules/observability/funnel.capture.server')
    await recordServerFunnelEventThroughSource(data)
    return { ok: true as const }
  })

export const readAdminOwnerActivationSummaryServer = createServerFn().handler(async () =>
  readAdminOwnerActivationSummaryThroughSource(),
)

export const readAdminAnalyticsServer = createServerFn().handler(async () => ({
  activationSummary: await readAdminOwnerActivationSummaryThroughSource(),
  posthogAppUrl: readPosthogAppUrl(),
}))

/** @deprecated Use recordOwnerActivationEventServer. */
export const recordPublicFunnelEventServer = recordOwnerActivationEventServer

/** @deprecated Funnel counts now live in PostHog. */
export async function readAdminFunnelSummaryThroughSource() {
  return { rows: [] as const, totalEvents: 0 }
}

/** @deprecated Funnel counts now live in PostHog. */
export const readAdminFunnelSummaryServer = createServerFn().handler(async () => ({ rows: [], totalEvents: 0 }))

function readPosthogAppUrl(): string | undefined {
  const value = process.env.POSTHOG_APP_URL ?? process.env.VITE_POSTHOG_APP_URL
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
