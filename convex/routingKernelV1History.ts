import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import { query, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'

const MAXIMUM_CHILDREN = 100
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
      { db: ctx.db as never, auth: ctx.auth },
      'read_admin_readbacks',
    )
    if (authority.kind !== 'allowed') return { kind: 'authorization_denied' as const }
    const opaqueReference = referenceValue(args.reference)
    if (!validOpaqueReference(opaqueReference)) return notFound(args.reference.kind, INVALID_REFERENCE)

    switch (args.reference.kind) {
      case 'binding': return await readBinding(ctx, args.reference.bindingId)
      case 'grant': return await readGrant(ctx, args.reference.grantId)
      case 'preparation': return await readPreparation(ctx, args.reference.preparationRequestId)
      case 'run': return await readRun(ctx, args.reference.rootRunId)
    }
  },
})

async function readBinding(ctx: QueryCtx, bindingId: string) {
  const binding = await ctx.db.query('routingKernelBindings')
    .withIndex('by_bindingId', (index) => index.eq('bindingId', bindingId))
    .unique()
  if (binding === null) return notFound('binding', bindingId)

  return {
    kind: 'historical_v1' as const,
    record: {
      kind: 'binding' as const,
      bindingId: binding.bindingId,
      businessId: String(binding.businessId),
      networkId: binding.networkId,
      capabilityContractId: binding.capabilityContractId,
      operation: binding.operation,
      admission: binding.admission,
      conformance: binding.conformance,
      registeredAt: binding.registeredAt,
      updatedAt: binding.updatedAt,
    },
  }
}

async function readGrant(ctx: QueryCtx, grantId: string) {
  const grant = await ctx.db.query('routingKernelAgentGrants')
    .withIndex('by_grantId', (index) => index.eq('grantId', grantId))
    .unique()
  if (grant === null) return notFound('grant', grantId)

  return {
    kind: 'historical_v1' as const,
    record: {
      kind: 'grant' as const,
      grantId: grant.grantId,
      status: grant.status,
      issuedAt: grant.issuedAt,
      updatedAt: grant.updatedAt,
      expiresAt: grant.expiresAt,
      ...(grant.revokedAt === undefined ? {} : { revokedAt: grant.revokedAt }),
    },
  }
}

async function readPreparation(ctx: QueryCtx, preparationRequestId: string) {
  const preparation = await ctx.db.query('routingKernelPreparationCandidateSets')
    .withIndex('by_preparationRequestId', (index) => index.eq('preparationRequestId', preparationRequestId))
    .unique()
  if (preparation === null) return notFound('preparation', preparationRequestId)

  const candidates = await ctx.db.query('routingKernelPreparationCandidates')
    .withIndex('by_preparationRequestId_and_position', (index) => index.eq('preparationRequestId', preparationRequestId))
    .take(MAXIMUM_CHILDREN + 1)
  if (candidates.length > MAXIMUM_CHILDREN) return tooLarge('preparation', preparationRequestId)

  return {
    kind: 'historical_v1' as const,
    record: {
      kind: 'preparation' as const,
      preparationRequestId: preparation.preparationRequestId,
      customerRequestId: preparation.customerRequestId,
      generation: preparation.generation,
      capabilityContractId: preparation.capabilityContractId,
      capabilityContractVersion: preparation.capabilityContractVersion,
      candidateSetDigest: preparation.candidateSetDigest,
      createdAt: preparation.createdAt,
      candidateCount: candidates.length,
    },
  }
}

async function readRun(ctx: QueryCtx, rootRunId: string) {
  const run = await ctx.db.query('routingKernelRootRuns')
    .withIndex('by_rootRunId', (index) => index.eq('rootRunId', rootRunId))
    .unique()
  if (run === null) return notFound('run', rootRunId)

  const [leaves, protocol] = await Promise.all([
    ctx.db.query('routingKernelLeafRuns')
      .withIndex('by_rootRunId_leafRunId', (index) => index.eq('rootRunId', rootRunId))
      .take(MAXIMUM_CHILDREN + 1),
    ctx.db.query('routingKernelProtocolRecords')
      .withIndex('by_rootRunId_sequence', (index) => index.eq('rootRunId', rootRunId))
      .take(MAXIMUM_CHILDREN + 1),
  ])
  if (leaves.length > MAXIMUM_CHILDREN || protocol.length > MAXIMUM_CHILDREN) return tooLarge('run', rootRunId)

  return {
    kind: 'historical_v1' as const,
    record: {
      kind: 'run' as const,
      rootRunId: run.rootRunId,
      networkId: run.networkId,
      executionMode: run.executionMode,
      state: run.state,
      effectState: run.effectState,
      updatedAt: run.updatedAt,
      ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }),
      leaves: leaves.map((leaf) => ({
        leafRunId: leaf.leafRunId,
        bindingId: leaf.bindingId,
        state: leaf.state,
        attemptDisposition: leaf.attemptDisposition,
        effectState: leaf.effectState,
      })),
      protocol: protocol.map((record) => ({
        recordId: record.recordId,
        sequence: record.sequence,
        type: record.type,
        ...(record.leafRunId === undefined ? {} : { leafRunId: record.leafRunId }),
        occurredAt: record.occurredAt,
      })),
    },
  }
}

function referenceValue(value: { kind: 'binding'; bindingId: string } | { kind: 'grant'; grantId: string } | { kind: 'preparation'; preparationRequestId: string } | { kind: 'run'; rootRunId: string }) {
  switch (value.kind) {
    case 'binding': return value.bindingId
    case 'grant': return value.grantId
    case 'preparation': return value.preparationRequestId
    case 'run': return value.rootRunId
  }
}

function validOpaqueReference(value: string) {
  return value.length > 0 && value.length <= MAXIMUM_REFERENCE_LENGTH && value === value.trim()
}

function notFound(kind: 'binding' | 'grant' | 'preparation' | 'run', ref: string) {
  return { kind: 'not_found' as const, referenceKind: kind, ref }
}

function tooLarge(kind: 'preparation' | 'run', ref: string) {
  return { kind: 'history_too_large' as const, referenceKind: kind, ref, maximumChildren: MAXIMUM_CHILDREN }
}
