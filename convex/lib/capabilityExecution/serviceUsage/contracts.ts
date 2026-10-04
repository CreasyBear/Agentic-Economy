import { v } from 'convex/values'

const support = v.object({ state: v.union(v.literal('pending'), v.literal('completed'), v.literal('refused'), v.literal('reconciliation_required'), v.literal('cancelled')),
  resultKind: v.union(v.literal('completed'), v.literal('pending'), v.literal('needs_authority'), v.literal('reconciliation_required'), v.literal('refused'), v.null()),
  evidenceHash: v.union(v.string(), v.null()), evidenceConflict: v.boolean() })
export const serviceUsageRevisionValue = v.object({ revisionRef: v.string(), previousRevisionRef: v.string(), revision: v.number(), sourceDigest: v.string(), support,
  quantityUnits: v.union(v.literal('1'), v.null()), effectiveAt: v.number(), observedAt: v.number() })
export const serviceUsageEvidenceValue = v.union(v.object({ kind: v.literal('available'), usageRef: v.string(), callRef: v.string(), unitDefinitionRef: v.literal('delivered_request:v1'),
  originalQuantityUnits: v.literal('1'), currentQuantityUnits: v.union(v.literal('1'), v.null()), currentRevisionRef: v.string(),
  originalOccurredAt: v.number(), originalObservedAt: v.number(), asOfObservedAt: v.number(), asOfEffectiveAt: v.number(), originalSourceDigest: v.string(),
  revisions: v.array(serviceUsageRevisionValue), evidenceDigest: v.string(), source: v.literal('canonical_call_support'), authoritativeForMoney: v.literal(false) }),
  v.object({ kind: v.literal('not_recorded') }), v.object({ kind: v.literal('not_observed') }),
  v.object({ kind: v.literal('refused'), code: v.string() }), v.object({ kind: v.literal('unavailable'), code: v.string() }))
export const ownerEvidenceArgs = { callRef: v.string(), asOfObservedAt: v.number(), asOfEffectiveAt: v.number() }
