import type { RecordPublicFunnelEventInput } from '@/modules/observability/funnel.functions'

export type FunnelCaptureInput = Pick<
  RecordPublicFunnelEventInput,
  | 'eventType'
  | 'source'
  | 'stage'
  | 'pseudonymousSessionId'
  | 'correlationId'
  | 'consentFlag'
  | 'referrer'
  | 'utmSource'
  | 'utmCampaign'
  | 'actorRef'
  | 'businessId'
  | 'payload'
>

export function buildFunnelEventProperties(input: FunnelCaptureInput): Record<string, string | number | boolean | null> {
  return {
    ae_source: input.source,
    ae_stage: input.stage,
    ae_correlation_id: input.correlationId,
    ae_consent_flag: input.consentFlag,
    ...(input.referrer === undefined ? {} : { ae_referrer: input.referrer }),
    ...(input.utmSource === undefined ? {} : { utm_source: input.utmSource }),
    ...(input.utmCampaign === undefined ? {} : { utm_campaign: input.utmCampaign }),
    ...(input.actorRef === undefined ? {} : { ae_actor_ref: input.actorRef }),
    ...(input.businessId === undefined ? {} : { ae_business_id: input.businessId }),
    ...(input.payload === undefined ? {} : input.payload),
  }
}
