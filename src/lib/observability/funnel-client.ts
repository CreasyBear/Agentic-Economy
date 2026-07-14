import {
  createFunnelCorrelationId,
  getOrCreatePseudonymousSessionId,
  readFunnelAttribution,
} from '@/lib/observability/funnel-attribution'
import type { FunnelCaptureInput } from '@/lib/observability/funnel-event-props'
import { captureClientFunnelEventOnClient } from '@/lib/observability/capture-client-events'
import type { FunnelEventType } from '@/modules/observability/public'
import { shouldDropPublicFunnelSourceSync } from '@/modules/observability/source-sync-gate'
import { isTelemetryAllowedForCurrentRoute, sanitizeTelemetryValue } from '@/lib/observability/private-route-safety'

export type EmitFunnelEventInput = {
  eventType: FunnelEventType
  stage?: FunnelCaptureInput['stage']
  businessId?: string
  claimId?: string
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
    ...(input.claimId === undefined ? {} : { claimId: input.claimId }),
    ...(input.payload === undefined ? {} : {
      payload: sanitizeTelemetryValue(input.payload) as Record<string, string | number | boolean | null>,
    }),
  }

  captureClientFunnelEventOnClient(captureInput)

  if (shouldDropPublicFunnelSourceSync(captureInput.eventType)) {
    return
  }

  try {
    await fetch('/api/observability/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: captureInput.eventType,
        source: captureInput.source,
        stage: captureInput.stage,
        pseudonymousSessionId: captureInput.pseudonymousSessionId,
        correlationId: captureInput.correlationId,
        consentFlag: captureInput.consentFlag,
        businessId: captureInput.businessId,
        ...(captureInput.referrer === undefined ? {} : { referrer: captureInput.referrer }),
        ...(captureInput.utmSource === undefined ? {} : { utmSource: captureInput.utmSource }),
        ...(captureInput.utmCampaign === undefined ? {} : { utmCampaign: captureInput.utmCampaign }),
        ...(captureInput.claimId === undefined ? {} : { claimId: captureInput.claimId }),
        ...(captureInput.payload === undefined ? {} : { payload: captureInput.payload }),
      }),
      keepalive: true,
    })
  } catch {
    // Activation sync must not block user flows.
  }
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
