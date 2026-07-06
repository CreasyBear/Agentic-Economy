import { createServerFn } from '@tanstack/react-start'

import {
  readAdminOwnerActivationSummaryThroughSource,
  recordFunnelEventSchema,
  recordOwnerActivationThroughSource,
  type RecordPublicFunnelEventInput,
} from './funnel.source'

export {
  recordFunnelEventSchema,
  recordOwnerActivationThroughSource,
  type RecordPublicFunnelEventInput,
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


function readPosthogAppUrl(): string | undefined {
  const value = process.env.POSTHOG_APP_URL ?? process.env.VITE_POSTHOG_APP_URL
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
