import { v, type Infer } from 'convex/values'
import { literalUnion } from '../../../../src/modules/common/convex-literals'
import { AuditSourceSystemValues, ActorKindValues, AuditTargetTypeValues, Package3AuditEventTypeValues } from '../../../../src/modules/observability/public'

const clerkSecurityEventTypeValue = v.union(
  v.literal('session.created'),
  v.literal('session.ended'),
  v.literal('session.revoked'),
  v.literal('user.updated'),
  v.literal('user.deleted'),
)

export const observationArgs = {
  deliveryRefHash: v.string(),
  providerIdentifier: v.string(),
  eventType: clerkSecurityEventTypeValue,
  targetRefHash: v.string(),
  observedAt: v.number(),
  securityAction: v.optional(
    v.union(
      v.literal('observe_only'),
      v.literal('revoke_interactive_credentials'),
      v.literal('retire_personal_account'),
    ),
  ),
  profileDisplayName: v.optional(v.string()),
  primaryEmailDigest: v.optional(v.string()),
}

export const observationResult = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
    eventRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('authority_conflict'),
      v.literal('event_conflict'),
    ),
  }),
)

export const historyItem = v.object({
  eventRef: v.string(),
  eventType: literalUnion(Package3AuditEventTypeValues),
  actorKind: literalUnion(ActorKindValues),
  actorRef: v.string(),
  targetType: literalUnion(AuditTargetTypeValues),
  targetRef: v.string(),
  outcome: v.string(),
  sourceSystem: literalUnion(AuditSourceSystemValues),
  observedAt: v.optional(v.number()),
  recordedAt: v.number(),
  correlationRef: v.string(),
})

export type ObservationResult = Infer<typeof observationResult>
