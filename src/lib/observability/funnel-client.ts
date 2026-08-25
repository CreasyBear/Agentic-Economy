import {
  createFunnelCorrelationId,
  getOrCreatePseudonymousSessionId,
  readFunnelAttribution,
} from '@/lib/observability/funnel-attribution'
import type { FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { captureClientFunnelEventOnClient } from '@/lib/observability/capture-client-events'
import type { FunnelEventType } from '@/modules/observability/public'
import { isTelemetryAllowedForCurrentRoute, sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'

export type EmitFunnelEventInput = {
  eventType: FunnelEventType
  stage?: FunnelCaptureInput['stage']
  businessId?: string
  consentFlag?: boolean
  payload?: Record<string, string | number | boolean | null>
  correlationPrefix?: string
}

const emittedOnce = new Set<string>()

export async function emitFunnelEvent(input: EmitFunnelEventInput): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }
  if (!isTelemetryAllowedForCurrentRoute()) return

  const onceKey = input.eventType === 'visitor_attributed' ? 'visitor_attributed' : undefined
  if (onceKey !== undefined && emittedOnce.has(onceKey)) {
    return
  }

  if (onceKey !== undefined) {
    emittedOnce.add(onceKey)
  }

  const attribution = readFunnelAttribution(readCurrentSearch())
  const captureInput: FunnelCaptureInput = {
    eventType: input.eventType,
    source: attribution.source,
    stage: input.stage ?? 'visitor',
    pseudonymousSessionId: getOrCreatePseudonymousSessionId(),
    correlationId: createFunnelCorrelationId(input.correlationPrefix ?? input.eventType),
    consentFlag: input.consentFlag ?? false,
    ...(attribution.referrer === undefined ? {} : { referrer: attribution.referrer }),
    ...(attribution.utmSource === undefined ? {} : { utmSource: attribution.utmSource }),
    ...(attribution.utmCampaign === undefined ? {} : { utmCampaign: attribution.utmCampaign }),
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    ...(input.payload === undefined ? {} : {
      payload: sanitizeTelemetryValue(input.payload) as Record<string, string | number | boolean | null>,
    }),
  }

  captureClientFunnelEventOnClient(captureInput)

}

export function emitFunnelEventOnce(input: EmitFunnelEventInput): void {
  void emitFunnelEvent(input)
}

function readCurrentSearch(): Record<string, unknown> {
  const params = new URLSearchParams(window.location.search)
  return Object.fromEntries(
    ['utm_source', 'utm_campaign', 'ref'].flatMap((key) => {
      const value = params.get(key)
      return value === null ? [] : [[key, value]]
    }),
  )
}
