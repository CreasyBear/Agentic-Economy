import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  createCurrentOperationCommitment,
  createCurrentOperationCommitmentFromMaterial,
  type CurrentOperationCommitment,
  type CurrentOperationCommitmentMaterial,
} from '@/modules/capability-supply/current-operation'
import {
  currentOperationSearchFact,
  searchCurrentOperationFacts,
  type CapabilityOperationSourceRecord,
  type CurrentOperationSearchFact,
  type OperationSearchInput,
} from '@/modules/capability-supply/operation-projection'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { operationRecordProjection } from './capabilitySupplyOperationShared'
import { readCurrentPublishedOperation } from './capabilitySupplyOperationKeyless'

export const currentOperationReadMode = v.union(
  v.literal('old'),
  v.literal('shadow'),
  v.literal('new'),
)
export type CurrentOperationReadMode = 'old' | 'shadow' | 'new'

export const currentOperationMismatchKind = v.union(
  v.literal('missing_projection'),
  v.literal('stale_projection'),
  v.literal('typed_outcome'),
  v.literal('descriptor_digest'),
  v.literal('invalid_projection'),
  v.literal('orphan_projection'),
)
export type CurrentOperationMismatchKind =
  | 'missing_projection'
  | 'stale_projection'
  | 'typed_outcome'
  | 'descriptor_digest'
  | 'invalid_projection'
  | 'orphan_projection'

export const currentOperationProjectionRebuildReturns = v.object({
  kind: v.union(v.literal('rebuilt'), v.literal('deactivated'), v.literal('missing')),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  outcomeKind: v.optional(v.union(v.literal('current'), v.literal('unavailable'), v.literal('dropped'))),
  operationRef: v.optional(v.string()),
  idempotent: v.boolean(),
})

export const currentOperationProjectionBackfillArgs = {
  paginationOpts: paginationOptsValidator,
} as const

export const currentOperationProjectionBackfillReturns = v.object({
  processed: v.number(),
  rebuilt: v.number(),
  dropped: v.number(),
  unavailable: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const currentOperationReadControlReturns = v.object({
  mode: currentOperationReadMode,
  reason: v.string(),
  releaseOwner: v.string(),
  verifiedActiveCount: v.optional(v.number()),
  verifiedProjectionDigest: v.optional(v.string()),
  updatedAt: v.number(),
  isDefault: v.boolean(),
})

const mismatchCount = v.object({ kind: currentOperationMismatchKind, count: v.number() })
export const currentOperationShadowDiagnosticsReturns = v.object({
  kind: v.literal('current_operation_shadow_diagnostic'),
  schemaVersion: v.literal('current-operation-shadow-diagnostic:v1'),
  sourceCount: v.number(),
  projectionCount: v.number(),
  comparedCount: v.number(),
  explainedMismatchCount: v.number(),
  unexplainedMismatchCount: v.number(),
  truncated: v.boolean(),
  mismatches: v.array(mismatchCount),
})

type ProjectedOutcome =
  | Readonly<{ kind: 'current'; descriptor: CapabilityOperationSourceRecord }>
  | Readonly<{
      kind: 'unavailable'
      reason: NonNullable<CapabilityOperationSourceRecord['unavailableReason']>
      descriptor: CapabilityOperationSourceRecord
    }>
  | Readonly<{
      kind: 'dropped'
      reason: Doc<'capabilityCurrentOperations'>['dropReason']
    }>

export async function currentOperationReadControlHandler(ctx: QueryCtx) {
  const row = await ctx.db.query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  return row === null
    ? {
        mode: 'old' as const,
        reason: 'projection_not_cut_over',
        releaseOwner: 'unassigned',
        updatedAt: 0,
        isDefault: true,
      }
    : {
        mode: row.mode,
        reason: row.reason,
        releaseOwner: row.releaseOwner,
        ...(row.verifiedActiveCount === undefined ? {} : { verifiedActiveCount: row.verifiedActiveCount }),
        ...(row.verifiedProjectionDigest === undefined
          ? {}
          : { verifiedProjectionDigest: row.verifiedProjectionDigest }),
        updatedAt: row.updatedAt,
        isDefault: false,
      }
}

export async function readCurrentOperationMode(ctx: Pick<QueryCtx, 'db'>): Promise<CurrentOperationReadMode> {
  const row = await ctx.db.query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  return row?.mode ?? 'old'
}

export async function readCurrentOperationControl(ctx: Pick<QueryCtx, 'db'>) {
  const row = await ctx.db.query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  return {
    mode: row?.mode ?? 'old' as CurrentOperationReadMode,
    ...(row?.verifiedActiveCount === undefined ? {} : { verifiedActiveCount: row.verifiedActiveCount }),
    ...(row?.verifiedProjectionDigest === undefined
      ? {}
      : { verifiedProjectionDigest: row.verifiedProjectionDigest }),
  }
}

export async function setCurrentOperationReadModeHandler(
  ctx: MutationCtx,
  args: Readonly<{
    mode: CurrentOperationReadMode
    reason: string
    releaseOwner: string
    now: number
  }>,
) {
  if (args.reason.trim().length === 0
    || args.reason.length > 240
    || args.releaseOwner.trim().length === 0
    || args.releaseOwner.length > 120
    || !Number.isSafeInteger(args.now)
    || args.now < 0) throw new Error('current_operation_read_control_invalid')
  const existing = await ctx.db.query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  const coverage = args.mode === 'old' ? undefined : await projectionCoverage(ctx)
  if (args.mode === 'new' && coverage !== undefined && !coverage.exact) {
    throw new Error('current_operation_cutover_not_ready')
  }
  const value = {
    controlRef: 'current_operation_registry' as const,
    mode: args.mode,
    reason: args.reason.trim(),
    releaseOwner: args.releaseOwner.trim(),
    ...(coverage === undefined
      ? {}
      : {
          verifiedActiveCount: coverage.sourceCount,
          verifiedProjectionDigest: coverage.projectionDigest,
        }),
    updatedAt: args.now,
  }
  if (existing === null) await ctx.db.insert('capabilityCurrentOperationReadControls', value)
  else await ctx.db.replace(existing._id, value)
  return { mode: args.mode }
}

export async function recordCurrentOperationMismatchExplanationHandler(
  ctx: MutationCtx,
  args: Readonly<{
    operationRef: string
    mismatchKind: CurrentOperationMismatchKind
    owner: string
    reason: string
    expiresAt: number
    regressionFixture: string
    now: number
  }>,
) {
  if (args.operationRef.trim().length === 0
    || args.owner.trim().length === 0
    || args.reason.trim().length === 0
    || args.regressionFixture.trim().length === 0
    || !Number.isSafeInteger(args.now)
    || !Number.isSafeInteger(args.expiresAt)
    || args.expiresAt <= args.now) throw new Error('current_operation_mismatch_explanation_invalid')
  const existing = await ctx.db.query('capabilityCurrentOperationMismatchExplanations')
    .withIndex('by_operationRef_and_mismatchKind', (query) => (
      query.eq('operationRef', args.operationRef).eq('mismatchKind', args.mismatchKind)
    ))
    .unique()
  const value = {
    operationRef: args.operationRef,
    mismatchKind: args.mismatchKind,
    owner: args.owner.trim(),
    reason: args.reason.trim(),
    expiresAt: args.expiresAt,
    regressionFixture: args.regressionFixture.trim(),
    recordedAt: args.now,
  }
  if (existing === null) await ctx.db.insert('capabilityCurrentOperationMismatchExplanations', value)
  else await ctx.db.replace(existing._id, value)
  return { recorded: true }
}

export async function rebuildCurrentOperationProjectionHandler(
  ctx: MutationCtx,
  args: Readonly<{ publicationRef: string; publicationRevision: number; now: number }>,
) {
  return await rebuildCurrentOperationProjection(ctx, args)
}

export async function rebuildCurrentOperationProjection(
  ctx: MutationCtx,
  args: Readonly<{ publicationRef: string; publicationRevision: number; now: number }>,
) {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', args.publicationRef).eq('revision', args.publicationRevision)
    ))
    .unique()
  const existing = await ctx.db.query('capabilityCurrentOperations')
    .withIndex('by_publicationRef_and_publicationRevision', (query) => (
      query.eq('publicationRef', args.publicationRef).eq('publicationRevision', args.publicationRevision)
    ))
    .unique()
  const existingDetail = await ctx.db.query('capabilityCurrentOperationDetails')
    .withIndex('by_publicationRef_and_publicationRevision', (query) => (
      query.eq('publicationRef', args.publicationRef).eq('publicationRevision', args.publicationRevision)
    ))
    .unique()
  if (publication === null) {
    return {
      kind: 'missing' as const,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
      idempotent: existing === null,
    }
  }
  if (publication.disposition !== 'current') {
    if (existing !== null && existing.active) await ctx.db.patch(existing._id, {
      active: false,
      sourceUpdatedAt: publication.updatedAt,
      projectedAt: args.now,
    })
    if (existingDetail !== null && existingDetail.active) await ctx.db.patch(existingDetail._id, {
      active: false,
      sourceUpdatedAt: publication.updatedAt,
      projectedAt: args.now,
    })
    await refreshProjectionReadControl(ctx)
    return {
      kind: 'deactivated' as const,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      operationRef: publication.operationRef,
      idempotent: existing === null || !existing.active,
    }
  }
  const projection = await operationRecordProjection(ctx, publication, args.now)
  const outcome: ProjectedOutcome = projection.kind === 'dropped'
    ? { kind: 'dropped', reason: projection.reason }
    : projection.record.unavailableReason === undefined
      ? { kind: 'current', descriptor: projection.record }
      : {
          kind: 'unavailable',
          reason: projection.record.unavailableReason,
          descriptor: projection.record,
        }
  const value = await projectionValue(ctx, publication, outcome, args.now)
  const searchIdempotent = existing !== null && sameProjection(existing, value.search)
  const detailIdempotent = value.detail === undefined
    ? existingDetail === null || !existingDetail.active
    : existingDetail !== null && sameProjection(existingDetail, value.detail)
  const idempotent = searchIdempotent && detailIdempotent
  if (existing === null) await ctx.db.insert('capabilityCurrentOperations', value.search)
  else if (!searchIdempotent) await ctx.db.replace(existing._id, value.search)
  if (value.detail === undefined) {
    if (existingDetail !== null && existingDetail.active) await ctx.db.patch(existingDetail._id, {
      active: false,
      sourceUpdatedAt: publication.updatedAt,
      projectedAt: args.now,
    })
  } else if (existingDetail === null) {
    await ctx.db.insert('capabilityCurrentOperationDetails', value.detail)
  } else if (!detailIdempotent) {
    await ctx.db.replace(existingDetail._id, value.detail)
  }
  await refreshProjectionReadControl(ctx)
  return {
    kind: 'rebuilt' as const,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    operationRef: publication.operationRef,
    outcomeKind: outcome.kind,
    idempotent,
  }
}

export async function backfillCurrentOperationProjectionsHandler(
  ctx: MutationCtx,
  args: Readonly<{ paginationOpts: { numItems: number; cursor: string | null } }>,
) {
  const pageSize = Math.min(8, Math.max(1, Math.floor(args.paginationOpts.numItems)))
  const page = await ctx.db.query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
    .paginate({ ...args.paginationOpts, numItems: pageSize })
  let rebuilt = 0
  let dropped = 0
  let unavailable = 0
  for (const publication of page.page) {
    const result = await rebuildCurrentOperationProjection(ctx, {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      now: Date.now(),
    })
    if (result.kind === 'rebuilt') {
      rebuilt += 1
      if (result.outcomeKind === 'dropped') dropped += 1
      if (result.outcomeKind === 'unavailable') unavailable += 1
    }
  }
  return {
    processed: page.page.length,
    rebuilt,
    dropped,
    unavailable,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}

export async function loadProjectedCurrentOperation(
  ctx: Pick<QueryCtx, 'db'>,
  operationRef: string,
): Promise<CapabilityOperationSourceRecord | null> {
  const row = await ctx.db.query('capabilityCurrentOperationDetails')
    .withIndex('by_operationRef_and_active', (query) => (
      query.eq('operationRef', operationRef).eq('active', true)
    ))
    .unique()
  return row === null ? null : descriptorFromProjection(row)
}

export async function searchProjectedCurrentOperations(
  ctx: Pick<QueryCtx, 'db'>,
  input: OperationSearchInput,
  now: number,
  expectedActiveCount?: number,
  expectedProjectionDigest?: string,
) {
  const rows = await ctx.db.query('capabilityCurrentOperations')
    .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
    .take(257)
  const facts = rows.flatMap((row) => {
    const fact = searchFactFromProjection(row)
    return fact === null ? [] : [fact]
  })
  const snapshotKey = `capability-supply:projection:${canonicalDigest(rows.map((row) => ({
    operationRef: row.operationRef,
    descriptorDigest: row.descriptorDigest ?? null,
    currentDigest: row.currentDigest ?? null,
    outcomeKind: row.outcomeKind,
    unavailableReason: row.unavailableReason ?? null,
    sourceUpdatedAt: row.sourceUpdatedAt,
  })) as StableHashValue)}`
  const projectionDigest = currentProjectionDigest(rows)
  const coverageValid = (expectedActiveCount === undefined || rows.length === expectedActiveCount)
    && (expectedProjectionDigest === undefined || projectionDigest === expectedProjectionDigest)
  const expectedSearchableCount = coverageValid ? facts.length : -1
  return await searchCurrentOperationFacts(
    input,
    facts,
    snapshotKey,
    async (operationRef) => await loadProjectedCurrentOperation(ctx, operationRef),
    now,
    expectedSearchableCount,
  )
}

/**
 * Shadow coordinator and authority boundary:
 *
 * publication joins -> old read ----\
 * projection row   -> new read ----- compare -> registry (old by default)
 * exact publication snapshot -----------------> Call admission/revalidation
 * rollback: set read mode to `old`; projection rows remain repairable data.
 */
export async function currentOperationShadowDiagnosticsHandler(
  ctx: QueryCtx,
  args: Readonly<{ now: number }>,
) {
  const [publications, rows] = await Promise.all([
    ctx.db.query('capabilityPublications')
      .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
      .take(258),
    ctx.db.query('capabilityCurrentOperations')
      .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
      .take(258),
  ])
  const rowByPublication = new Map(rows.map((row) => (
    [`${row.publicationRef}:${row.publicationRevision}`, row] as const
  )))
  const mismatchRows: Array<{ operationRef: string; kind: CurrentOperationMismatchKind }> = []
  let comparedCount = 0
  for (const publication of publications.slice(0, 257)) {
    const oldProjection = await operationRecordProjection(ctx, publication, args.now)
    const row = rowByPublication.get(`${publication.publicationRef}:${publication.revision}`)
    if (row === undefined) {
      mismatchRows.push({ operationRef: publication.operationRef, kind: 'missing_projection' })
      continue
    }
    rowByPublication.delete(`${publication.publicationRef}:${publication.revision}`)
    if (row.sourceUpdatedAt !== publication.updatedAt) {
      mismatchRows.push({ operationRef: publication.operationRef, kind: 'stale_projection' })
    }
    const expectedOutcome = oldProjection.kind === 'dropped'
      ? `dropped:${oldProjection.reason}`
      : oldProjection.record.unavailableReason === undefined
        ? 'current'
        : `unavailable:${oldProjection.record.unavailableReason}`
    const actualOutcome = row.outcomeKind === 'dropped'
      ? `dropped:${row.dropReason ?? 'invalid'}`
      : row.outcomeKind === 'unavailable'
        ? `unavailable:${row.unavailableReason ?? 'invalid'}`
        : 'current'
    if (actualOutcome !== expectedOutcome) {
      mismatchRows.push({ operationRef: publication.operationRef, kind: 'typed_outcome' })
      continue
    }
    if (oldProjection.kind === 'projected') {
      comparedCount += 1
      const expectedDigest = canonicalDigest(oldProjection.record as StableHashValue)
      if (row.descriptorDigest === undefined || row.searchFactJson === undefined) {
        mismatchRows.push({ operationRef: publication.operationRef, kind: 'invalid_projection' })
      } else if (row.descriptorDigest !== expectedDigest) {
        mismatchRows.push({ operationRef: publication.operationRef, kind: 'descriptor_digest' })
      }
    }
  }
  for (const orphan of rowByPublication.values()) {
    mismatchRows.push({ operationRef: orphan.operationRef, kind: 'orphan_projection' })
  }
  const explanations = await Promise.all(mismatchRows.map(async (mismatch) => (
    await ctx.db.query('capabilityCurrentOperationMismatchExplanations')
      .withIndex('by_operationRef_and_mismatchKind', (query) => (
        query.eq('operationRef', mismatch.operationRef).eq('mismatchKind', mismatch.kind)
      ))
      .unique()
  )))
  const counts = new Map<CurrentOperationMismatchKind, number>()
  let explainedMismatchCount = 0
  mismatchRows.forEach((mismatch, index) => {
    counts.set(mismatch.kind, (counts.get(mismatch.kind) ?? 0) + 1)
    const explanation = explanations[index]
    if (explanation !== undefined
      && explanation !== null
      && explanation.expiresAt > args.now
      && explanation.owner.trim().length > 0
      && explanation.reason.trim().length > 0
      && explanation.regressionFixture.trim().length > 0) explainedMismatchCount += 1
  })
  const kinds: readonly CurrentOperationMismatchKind[] = [
    'missing_projection',
    'stale_projection',
    'typed_outcome',
    'descriptor_digest',
    'invalid_projection',
    'orphan_projection',
  ]
  return {
    kind: 'current_operation_shadow_diagnostic' as const,
    schemaVersion: 'current-operation-shadow-diagnostic:v1' as const,
    sourceCount: Math.min(publications.length, 257),
    projectionCount: Math.min(rows.length, 257),
    comparedCount,
    explainedMismatchCount,
    unexplainedMismatchCount: mismatchRows.length - explainedMismatchCount,
    truncated: publications.length > 257 || rows.length > 257,
    mismatches: kinds.flatMap((kind) => {
      const count = counts.get(kind) ?? 0
      return count === 0 ? [] : [{ kind, count }]
    }),
  }
}

async function projectionValue(
  ctx: MutationCtx,
  publication: Doc<'capabilityPublications'>,
  outcome: ProjectedOutcome,
  now: number,
): Promise<Readonly<{
  search: Omit<Doc<'capabilityCurrentOperations'>, '_id' | '_creationTime'>
  detail?: Omit<Doc<'capabilityCurrentOperationDetails'>, '_id' | '_creationTime'>
}>> {
  const base = {
    schemaVersion: 'current-operation-projection:v1' as const,
    operationRef: publication.operationRef,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    networkId: publication.networkId,
    active: true,
    sourceUpdatedAt: publication.updatedAt,
    projectedAt: now,
  }
  if (outcome.kind === 'dropped') return { search: {
      ...base,
      outcomeKind: 'dropped',
      ...(outcome.reason === undefined ? {} : { dropReason: outcome.reason }),
      searchTokens: [],
    } }
  const commitment = await commitmentFor(ctx, publication, outcome.descriptor, now)
  const descriptorDigest = canonicalDigest(outcome.descriptor as StableHashValue)
  return {
    search: {
      ...base,
      outcomeKind: outcome.kind,
      ...(outcome.kind === 'unavailable' ? { unavailableReason: outcome.reason } : {}),
      descriptorDigest,
      currentDigest: commitment.currentDigest,
      searchTokens: searchTokens(outcome.descriptor),
      searchFactJson: JSON.stringify(currentOperationSearchFact(outcome.descriptor, now)),
    },
    detail: {
      schemaVersion: 'current-operation-detail:v1',
      operationRef: publication.operationRef,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      active: true,
      descriptorJson: JSON.stringify(outcome.descriptor),
      descriptorDigest,
      commitmentJson: JSON.stringify(commitment),
      currentDigest: commitment.currentDigest,
      sourceUpdatedAt: publication.updatedAt,
      projectedAt: now,
    },
  }
}

async function commitmentFor(
  ctx: MutationCtx,
  publication: Doc<'capabilityPublications'>,
  record: CapabilityOperationSourceRecord,
  now: number,
): Promise<CurrentOperationCommitment> {
  const exact = await readCurrentPublishedOperation(ctx, publication.operationRef, now)
  if (exact !== undefined) return createCurrentOperationCommitment({
    operationRef: publication.operationRef,
    operation: exact,
  })
  const binding = await ctx.db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
    .unique()
  if (binding === null) throw new Error('current_operation_projection_binding_missing')
  const reason = record.unavailableReason
    ?? (record.readiness.observedAt === undefined || record.readiness.validUntil === undefined
      ? 'temporarily_unavailable'
      : undefined)
  const providerAuthority: CurrentOperationCommitmentMaterial['providerAuthority'] =
    binding.authority.kind === 'keyless'
      ? { kind: 'keyless' }
      : {
          kind: 'provider_connection',
          connectionRef: binding.authority.connectionRef,
          providerRef: binding.authority.providerRef,
          ...(publication.connectionAuthority === undefined
            ? {}
            : {
                authorityGeneration: publication.connectionAuthority.authorityGeneration,
                authorityDigest: publication.connectionAuthority.authorityDigest,
              }),
        }
  const material: CurrentOperationCommitmentMaterial = {
    schemaVersion: 'current_operation_commitment:v1',
    operationRef: publication.operationRef as CurrentOperationCommitmentMaterial['operationRef'],
    operationId: record.operationId,
    runtimeEnvironment: publication.runtimeEnvironment,
    publication: {
      ref: publication.publicationRef,
      revision: publication.revision,
      digest: publication.sourceDigest,
    },
    materialAuthorityDigest: canonicalDigest({
      publication: publication.sourceDigest,
      contract: publication.contractDigest,
      offering: publication.offeringId,
      binding: publication.bindingId,
      price: record.price,
      terms: record.materialTerms,
      effects: record.contract.effects,
      readiness: record.readiness,
    } as StableHashValue),
    contractRef: record.contract.ref,
    offering: {
      id: publication.offeringId,
      digest: canonicalDigest({
        id: publication.offeringId,
        offering: record.offering,
        price: record.price,
        terms: record.materialTerms,
      } as StableHashValue),
    },
    binding: {
      id: publication.bindingId,
      digest: canonicalDigest({
        id: publication.bindingId,
        authentication: record.authentication,
        transport: record.transport,
      } as StableHashValue),
    },
    commercial: {
      price: record.price,
      priceDigest: canonicalDigest(record.price as StableHashValue),
      ...(publication.priceDigest !== undefined && isCanonicalDigest(publication.priceDigest)
        ? { priceAuthorityDigest: publication.priceDigest }
        : {}),
      materialTermsDigest: canonicalDigest(record.materialTerms as StableHashValue),
    },
    effects: record.contract.effects,
    effectsDigest: canonicalDigest(record.contract.effects as StableHashValue),
    readiness: {
      ...(record.readiness.observedAt === undefined ? {} : { observedAt: record.readiness.observedAt }),
      ...(record.readiness.validUntil === undefined ? {} : { validUntil: record.readiness.validUntil }),
      qualificationDigest: canonicalDigest({
        integrated: record.integrated,
        routeable: record.routeable,
        reason: reason ?? null,
        readiness: record.readiness,
      } as StableHashValue),
      evidenceDigest: canonicalDigest((record.priceEvidence?.evidenceRefs ?? []) as StableHashValue),
      ...(reason === undefined ? {} : { unavailableReason: reason }),
    },
    transport: { adapterId: binding.adapterId, configDigest: binding.configDigest },
    providerAuthority,
  }
  return createCurrentOperationCommitmentFromMaterial(material)
}

function descriptorFromProjection(
  row: Doc<'capabilityCurrentOperationDetails'>,
): CapabilityOperationSourceRecord | null {
  try {
    const parsed: unknown = JSON.parse(row.descriptorJson)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (canonicalDigest(parsed as StableHashValue) !== row.descriptorDigest) return null
    return parsed as CapabilityOperationSourceRecord
  } catch {
    return null
  }
}

function searchFactFromProjection(
  row: Doc<'capabilityCurrentOperations'>,
): CurrentOperationSearchFact | null {
  if (row.outcomeKind === 'dropped' || row.searchFactJson === undefined) return null
  try {
    const parsed: unknown = JSON.parse(row.searchFactJson)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as CurrentOperationSearchFact
  } catch {
    return null
  }
}

function searchTokens(record: CapabilityOperationSourceRecord): string[] {
  const source = [
    ...record.searchTerms,
    record.offering.label,
    record.offering.summary,
    record.business.name,
    record.contract.capabilityId,
    record.contract.description,
  ].join(' ').toLowerCase()
  return [...new Set(source.split(/[^a-z0-9]+/u).filter((token) => token.length > 0))].sort()
}

function sameProjection<T extends 'capabilityCurrentOperations' | 'capabilityCurrentOperationDetails'>(
  existing: Doc<T>,
  next: Omit<Doc<T>, '_id' | '_creationTime'>,
): boolean {
  const { _id, _creationTime, projectedAt: _projectedAt, ...current } = existing
  const { projectedAt: _nextProjectedAt, ...candidate } = next
  return canonicalDigest(current as StableHashValue) === canonicalDigest(candidate as StableHashValue)
}

async function projectionCoverage(ctx: Pick<QueryCtx, 'db'>) {
  const [publications, rows] = await Promise.all([
    ctx.db.query('capabilityPublications')
      .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
      .take(258),
    ctx.db.query('capabilityCurrentOperations')
      .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
      .take(258),
  ])
  const rowByPublication = new Map(rows.map((row) => [
    `${row.publicationRef}:${row.publicationRevision}`,
    row,
  ] as const))
  const sourceExact = publications.length <= 257
    && rows.length <= 257
    && publications.length === rows.length
    && publications.every((publication) => {
      const row = rowByPublication.get(`${publication.publicationRef}:${publication.revision}`)
      return row !== undefined && row.sourceUpdatedAt === publication.updatedAt
    })
  return {
    exact: sourceExact,
    sourceCount: Math.min(publications.length, 257),
    projectionDigest: currentProjectionDigest(rows.slice(0, 257)),
  }
}

async function refreshProjectionReadControl(ctx: MutationCtx): Promise<void> {
  const control = await ctx.db.query('capabilityCurrentOperationReadControls')
    .withIndex('by_controlRef', (query) => query.eq('controlRef', 'current_operation_registry'))
    .unique()
  if (control === null || control.mode === 'old') return
  const coverage = await projectionCoverage(ctx)
  await ctx.db.patch(control._id, {
    verifiedActiveCount: coverage.sourceCount,
    verifiedProjectionDigest: coverage.projectionDigest,
  })
}

function currentProjectionDigest(rows: readonly Doc<'capabilityCurrentOperations'>[]): string {
  return canonicalDigest(rows.map((row) => ({
    operationRef: row.operationRef,
    publicationRef: row.publicationRef,
    publicationRevision: row.publicationRevision,
    sourceUpdatedAt: row.sourceUpdatedAt,
    outcomeKind: row.outcomeKind,
    unavailableReason: row.unavailableReason ?? null,
    dropReason: row.dropReason ?? null,
    descriptorDigest: row.descriptorDigest ?? null,
    currentDigest: row.currentDigest ?? null,
    searchFactJson: row.searchFactJson ?? null,
  })) as StableHashValue)
}
