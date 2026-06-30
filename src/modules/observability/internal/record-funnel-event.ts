import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId } from '@/modules/common/ids'
import type {
  ActivationStage,
  FunnelEventType,
  OwnerActivationState,
  RedactedPayload,
} from '@/modules/observability/public'
import { applyFunnelEvent, initialOwnerActivationState, type FunnelEventContract } from './funnel'
import { payloadHash, redactPayload } from './redaction'

export type RecordFunnelEventInput = {
  eventType: FunnelEventType
  source: string
  stage: ActivationStage
  pseudonymousSessionId: string
  correlationId: string
  consentFlag: boolean
  redactedPayload?: RedactedPayload
  referrer?: string
  utmSource?: string
  utmCampaign?: string
  actorRef?: string
  businessId?: BusinessId
  claimId?: string
  now: number
}

export type FunnelEventPersistenceRow = {
  eventId: string
  eventType: FunnelEventType
  source: string
  stage: ActivationStage
  pseudonymousSessionId: string
  correlationId: string
  consentFlag: boolean
  redactedPayloadJson: string
  createdAt: number
  referrer?: string
  utmSource?: string
  utmCampaign?: string
  actorRef?: string
  businessId?: string
  claimId?: string
}

export type RecordFunnelEventResult = {
  event: FunnelEventPersistenceRow
  ownerActivation?: OwnerActivationState
}

export function recordFunnelEvent(
  input: RecordFunnelEventInput,
  ownerActivationByBusiness: ReadonlyMap<string, OwnerActivationState>,
): RecordFunnelEventResult {
  const redactedPayload = redactPayload(input.redactedPayload ?? {})
  const contract = toFunnelEventContract(input, redactedPayload)
  const event = toPersistenceRow(contract, input)

  if (input.businessId === undefined) {
    return { event }
  }

  const existing =
    ownerActivationByBusiness.get(input.businessId) ??
    initialOwnerActivationState(input.businessId, input.now)

  return {
    event,
    ownerActivation: applyFunnelEvent(existing, contract),
  }
}

function toFunnelEventContract(input: RecordFunnelEventInput, redactedPayload: RedactedPayload): FunnelEventContract {
  return {
    eventType: input.eventType,
    source: input.source.trim().slice(0, 120) || 'unknown',
    stage: input.stage,
    pseudonymousSessionId: input.pseudonymousSessionId.trim().slice(0, 120),
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    redactedPayload: JSON.stringify(redactedPayload),
    consentFlag: input.consentFlag,
    correlationId: brandNonEmpty(input.correlationId.trim().slice(0, 120), 'CorrelationId') as CorrelationId,
    createdAt: input.now,
  }
}

function toPersistenceRow(contract: FunnelEventContract, input: RecordFunnelEventInput): FunnelEventPersistenceRow {
  const redactedPayload = JSON.parse(contract.redactedPayload) as RedactedPayload

  return {
    eventId: `funnel:${payloadHash(redactedPayload)}:${contract.correlationId}:${contract.eventType}`,
    eventType: contract.eventType,
    source: contract.source,
    stage: contract.stage,
    pseudonymousSessionId: contract.pseudonymousSessionId,
    correlationId: contract.correlationId,
    consentFlag: contract.consentFlag,
    redactedPayloadJson: contract.redactedPayload,
    createdAt: contract.createdAt,
    ...(input.referrer === undefined ? {} : { referrer: input.referrer.slice(0, 240) }),
    ...(input.utmSource === undefined ? {} : { utmSource: input.utmSource.slice(0, 120) }),
    ...(input.utmCampaign === undefined ? {} : { utmCampaign: input.utmCampaign.slice(0, 120) }),
    ...(input.actorRef === undefined ? {} : { actorRef: input.actorRef.slice(0, 120) }),
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    ...(input.claimId === undefined ? {} : { claimId: input.claimId }),
  }
}
