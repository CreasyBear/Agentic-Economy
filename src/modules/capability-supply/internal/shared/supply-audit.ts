import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { RegistrationContext, SupplyCommandActor } from './command-envelope'

export type SupplyAuditInput = Readonly<{
  eventType: 'capability_offering.registered' | 'capability_binding.registered' | 'capability_supply.eligibility_changed'
    | 'capability_binding.quarantined' | 'capability_publication.published'
  action: 'register_offering' | 'register_binding' | 'set_eligibility' | 'quarantine_binding' | 'publish_capability'
  targetType: 'capability_offering' | 'capability_binding' | 'capability_publication'
  targetRef: string
  actor: SupplyCommandActor
  context: RegistrationContext
  payload: StableHashValue
  beforeState: string
  afterState: string
  createdAt: number
}>

export type SupplyAuditEventRow = Readonly<{
  eventId: string
  eventType?: string
  actorKind?: string
  actorRef?: string
  targetType?: string
  targetRef?: string
  beforeState?: string
  afterState?: string
  idempotencyKey?: string
  correlationId?: string
  reasonCode?: string
  evidenceRefs?: readonly string[]
  redactedPayloadJson?: string
  payloadHash?: string
  createdAt: number
}>

export function supplyAuditEffectRef(input: SupplyAuditInput): string {
  return `${supplyAuditEventId(input)}#${canonicalDigest({
    eventId: supplyAuditEventId(input), eventType: input.eventType,
    actorKind: input.actor.kind, actorRef: input.actor.ref,
    targetType: input.targetType, targetRef: input.targetRef,
    beforeState: input.beforeState, afterState: input.afterState,
    idempotencyKey: input.context.operationKey, correlationId: input.context.correlationId,
    reasonCode: input.context.reasonCode, evidenceRefs: input.context.evidenceRefs,
    redactedPayloadJson: stableStringify(input.payload), payloadHash: canonicalDigest(input.payload),
    createdAt: input.createdAt,
  })}`
}

export function storedSupplyAuditEffectRef(existing: SupplyAuditEventRow): string {
  return `${existing.eventId}#${canonicalDigest({
    eventId: existing.eventId, eventType: existing.eventType,
    actorKind: existing.actorKind, actorRef: existing.actorRef,
    targetType: existing.targetType, targetRef: existing.targetRef,
    beforeState: existing.beforeState ?? '', afterState: existing.afterState ?? '',
    idempotencyKey: existing.idempotencyKey ?? '', correlationId: existing.correlationId ?? '',
    reasonCode: existing.reasonCode ?? '', evidenceRefs: existing.evidenceRefs ?? [],
    redactedPayloadJson: existing.redactedPayloadJson ?? '', payloadHash: existing.payloadHash ?? '',
    createdAt: existing.createdAt,
  } as StableHashValue)}`
}

export function supplyAuditEventId(input: SupplyAuditInput): string {
  return `audit:capability_supply:${canonicalDigest({
    action: input.action, eventType: input.eventType, targetType: input.targetType, targetRef: input.targetRef,
    actorKind: input.actor.kind, actorRef: input.actor.ref, operationKey: input.context.operationKey,
  })}`
}

export function storedAuditMatches(
  existing: SupplyAuditEventRow,
  input: SupplyAuditInput,
  allowedBeforeStates: readonly string[],
): boolean {
  const redactedPayloadJson = stableStringify(input.payload)
  const payloadHash = canonicalDigest(input.payload)
  return existing.eventId === supplyAuditEventId(input)
    && existing.eventType === input.eventType
    && existing.actorKind === input.actor.kind
    && existing.actorRef === input.actor.ref
    && existing.targetType === input.targetType
    && existing.targetRef === input.targetRef
    && existing.beforeState !== undefined
    && allowedBeforeStates.includes(existing.beforeState)
    && existing.afterState === input.afterState
    && existing.idempotencyKey === input.context.operationKey
    && existing.correlationId === input.context.correlationId
    && existing.reasonCode === input.context.reasonCode
    && sameStrings(existing.evidenceRefs ?? [], input.context.evidenceRefs)
    && existing.redactedPayloadJson === redactedPayloadJson
    && existing.payloadHash === payloadHash
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
