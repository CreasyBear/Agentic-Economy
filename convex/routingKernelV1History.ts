import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import { query } from './_generated/server'
import { resolveAdminAuthority } from './authz'

const MAXIMUM_REFERENCE_LENGTH = 200
const INVALID_REFERENCE = 'invalid_reference'

const referenceKind = literalUnion(['binding', 'grant', 'preparation', 'run'] as const)
const reference = v.union(
  v.object({ kind: v.literal('binding'), bindingId: v.string() }),
  v.object({ kind: v.literal('grant'), grantId: v.string() }),
  v.object({ kind: v.literal('preparation'), preparationRequestId: v.string() }),
  v.object({ kind: v.literal('run'), rootRunId: v.string() }),
)

const runState = literalUnion(['running', 'completed', 'outcome_unknown', 'failed', 'cancelled', 'incident_frozen'] as const)
const leafState = literalUnion(['pending', 'released', 'completed', 'outcome_unknown', 'failed', 'cancelled', 'incident_frozen'] as const)
const attemptDisposition = literalUnion(['not_released', 'released', 'dispatched', 'indeterminate'] as const)
const effectState = literalUnion(['not_started', 'released', 'committed', 'unknown', 'not_committed'] as const)
const protocolRecordType = literalUnion([
  'root_run_admitted',
  'step_grant_consumed',
  'disclosure_grant_consumed',
  'provider_attempt_released',
  'provider_outcome_reported',
  'provider_outcome_unknown',
  'provider_effect_not_committed',
  'fallback_released',
  'fallback_release_refused',
  'root_run_completed',
  'root_run_outcome_unknown',
  'root_run_failed',
  'provider_reconciliation_observed',
  'root_run_reconciled',
  'cancellation_requested',
  'root_run_cancelled',
  'provider_cancellation_requested',
  'provider_cancellation_accepted',
  'provider_cancellation_rejected',
  'provider_cancellation_unknown',
  'incident_freeze_observed',
  'incident_epoch_stale_observed',
  'incident_canary_recovery_consumed',
] as const)

const historicalRecord = v.union(
  v.object({
    kind: v.literal('binding'),
    bindingId: v.string(),
    businessId: v.string(),
    networkId: v.string(),
    capabilityContractId: v.string(),
    operation: v.string(),
    admission: literalUnion(['admitted', 'not_admitted'] as const),
    conformance: literalUnion(['conformant', 'not_conformant'] as const),
    registeredAt: v.number(),
    updatedAt: v.number(),
  }),
  v.object({
    kind: v.literal('grant'),
    grantId: v.string(),
    status: literalUnion(['active', 'revoked'] as const),
    issuedAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal('preparation'),
    preparationRequestId: v.string(),
    customerRequestId: v.string(),
    generation: v.number(),
    capabilityContractId: v.string(),
    capabilityContractVersion: v.string(),
    candidateSetDigest: v.string(),
    createdAt: v.number(),
    candidateCount: v.number(),
  }),
  v.object({
    kind: v.literal('run'),
    rootRunId: v.string(),
    networkId: v.string(),
    executionMode: literalUnion(['simulation', 'live'] as const),
    state: runState,
    effectState,
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    leaves: v.array(v.object({
      leafRunId: v.string(),
      bindingId: v.string(),
      state: leafState,
      attemptDisposition,
      effectState,
    })),
    protocol: v.array(v.object({
      recordId: v.string(),
      sequence: v.number(),
      type: protocolRecordType,
      leafRunId: v.optional(v.string()),
      occurredAt: v.number(),
    })),
  }),
)

const result = v.union(
  v.object({ kind: v.literal('historical_v1'), record: historicalRecord }),
  v.object({ kind: v.literal('not_found'), referenceKind, ref: v.string() }),
  v.object({ kind: v.literal('authorization_denied') }),
  v.object({ kind: v.literal('history_too_large'), referenceKind, ref: v.string(), maximumChildren: v.number() }),
)

export const read = query({
  args: { reference },
  returns: result,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind !== 'allowed') return { kind: 'authorization_denied' as const }
    const opaqueReference = referenceValue(args.reference)
    if (!validOpaqueReference(opaqueReference)) return notFound(args.reference.kind, INVALID_REFERENCE)

    switch (args.reference.kind) {
      case 'binding':
      case 'grant':
      case 'preparation':
      case 'run':
        return notFound(args.reference.kind, opaqueReference)
      default: {
        const _exhaustive: never = args.reference
        return _exhaustive
      }
    }
  },
})

function referenceValue(value: { kind: 'binding'; bindingId: string } | { kind: 'grant'; grantId: string } | { kind: 'preparation'; preparationRequestId: string } | { kind: 'run'; rootRunId: string }) {
  switch (value.kind) {
    case 'binding': return value.bindingId
    case 'grant': return value.grantId
    case 'preparation': return value.preparationRequestId
    case 'run': return value.rootRunId
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}

function validOpaqueReference(value: string) {
  return value.length > 0 && value.length <= MAXIMUM_REFERENCE_LENGTH && value === value.trim()
}

function notFound(kind: 'binding' | 'grant' | 'preparation' | 'run', ref: string) {
  return { kind: 'not_found' as const, referenceKind: kind, ref }
}
