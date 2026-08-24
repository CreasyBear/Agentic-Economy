import { v } from 'convex/values'

import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  compareCapabilityOperations,
  detailCapabilityOperation,
  inspectCapabilityOperationPlan,
  searchCapabilityOperations,
  serializeInspectPlanResult,
  serializeOperationCompareResult,
  serializeOperationDetailResult,
  serializeOperationSearchResult,
  type CapabilityOperationSourcePort,
  type CapabilityOperationSourceRecord,
  type InspectPlanInput,
  type OperationCompareInput,
  type OperationDetailInput,
  type OperationSearchInput,
} from '@/modules/capability-supply/public'

import type { QueryCtx } from './_generated/server'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import {
  CURRENT_OPERATION_PROJECTION_DROP_REASONS,
  exactAmount,
  operationRecord,
  operationRecordProjection,
  publicAuthentication,
  publicPrice,
  publicPriceBreakdown,
} from './capabilitySupplyOperationShared'
import {
  loadProjectedCurrentOperation,
  readCurrentOperationMode,
  searchProjectedCurrentOperations,
} from './capabilitySupplyOperationProjection'

const currentOperationProjectionDropReason = v.union(
  ...CURRENT_OPERATION_PROJECTION_DROP_REASONS.map((reason) => v.literal(reason)),
)
const currentOperationUnavailableReason = v.union(
  v.literal('setup_required'),
  v.literal('temporarily_unavailable'),
  v.literal('readiness_expired'),
  v.literal('publisher_withdrew'),
  v.literal('under_review'),
  v.literal('updated_terms_require_review'),
  v.literal('not_supported_by_ae'),
)
const CURRENT_OPERATION_UNAVAILABLE_REASONS = [
  'setup_required',
  'temporarily_unavailable',
  'readiness_expired',
  'publisher_withdrew',
  'under_review',
  'updated_terms_require_review',
  'not_supported_by_ae',
] as const
export const currentProjectionDiagnosticsReturns = v.object({
  kind: v.literal('current_operation_projection_diagnostic'),
  schemaVersion: v.literal('current-operation-projection-diagnostic:v1'),
  scannedCount: v.number(),
  projectedCount: v.number(),
  unavailableCount: v.number(),
  dropCount: v.number(),
  truncated: v.boolean(),
  serializedProjectionBytes: v.number(),
  databaseQueries: v.number(),
  documentsRead: v.number(),
  bytesRead: v.number(),
  drops: v.array(v.object({ reason: currentOperationProjectionDropReason, count: v.number() })),
  unavailable: v.array(v.object({ reason: currentOperationUnavailableReason, count: v.number() })),
})
export const currentSearchBenchmarkReturns = v.object({
  kind: v.literal('current_operation_search_measurement'),
  schemaVersion: v.literal('current-operation-search-measurement:v1'),
  outcome: v.union(v.literal('ok'), v.literal('no_candidates'), v.literal('unavailable')),
  refusalReason: v.optional(v.union(
    v.literal('query_invalid'),
    v.literal('source_unavailable'),
    v.literal('source_capacity_exceeded'),
  )),
  itemCount: v.number(),
  matchedCount: v.number(),
  serializedResultBytes: v.number(),
  databaseQueries: v.number(),
  documentsRead: v.number(),
  bytesRead: v.number(),
})

const publicMaterialTerm = v.object({ label: v.string(), value: v.string() })
const publicRelationship = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(),
})
const publicDataUse = v.object({
  effectId: v.string(),
  inputPointer: v.string(),
  classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  phase: v.union(v.literal('preparation'), v.literal('execution')),
  recipient: v.union(v.literal('candidate_binding'), v.literal('selected_binding'), v.literal('named_recipient')),
  purposes: v.array(v.string()),
})
const publicEffect = v.object({
  effectId: v.string(),
  class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
  authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
  reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
})
const publicEvidence = v.object({
  evidenceId: v.string(),
  outputPointer: v.string(),
  purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
})
const publicCancellation = v.object({ kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')) })
const publicRecovery = v.object({
  idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
  recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
})
const publicAvailability = v.object({
  posture: v.union(v.literal('integrated'), v.literal('routeable'), v.literal('unavailable')),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
  reason: v.optional(v.union(
    v.literal('setup_required'),
    v.literal('temporarily_unavailable'),
    v.literal('readiness_expired'),
    v.literal('publisher_withdrew'),
    v.literal('under_review'),
    v.literal('updated_terms_require_review'),
    v.literal('not_supported_by_ae'),
  )),
})
const publicTransport = v.object({
  method: v.union(v.literal('GET'), v.literal('POST')),
  pathTemplate: v.optional(v.string()),
  responseStatus: v.optional(v.number()),
  responseContentType: v.optional(v.string()),
  requestTimeoutMs: v.number(),
})
const publicPriceEvidence = v.object({
  priceDigest: v.string(),
  sourceRef: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})
const publicNavigation = v.object({
  relation: v.union(
    v.literal('search'),
    v.literal('detail'),
    v.literal('compare'),
    v.literal('inspect_plan'),
    v.literal('execute'),
    v.literal('invoke'),
    v.literal('authenticate'),
    v.literal('create_customer_request'),
    v.literal('review_route'),
    v.literal('read_status'),
    v.literal('reconcile'),
    v.literal('cancel'),
  ),
  pathTemplate: v.optional(v.string()),
  method: v.union(v.literal('GET'), v.literal('POST')),
  actionId: v.string(),
  authentication: v.union(v.literal('none'), v.literal('required')),
  inputSchema: v.optional(v.any()), // runtime-validated JsonValue boundary
  surfaces: v.optional(v.array(v.union(
    v.literal('ui'),
    v.literal('http'),
    v.literal('agentJson'),
    v.literal('chat'),
    v.literal('cli'),
    v.literal('mcp'),
  ))),
  precondition: v.optional(v.string()),
})
const publicAnnotation = v.object({
  annotationId: v.string(),
  document: v.union(v.literal('input'), v.literal('output')),
  pointer: v.string(),
  label: v.string(),
  role: v.union(
    v.literal('request'),
    v.literal('constraint'),
    v.literal('comparison'),
    v.literal('commitment'),
    v.literal('result'),
    v.literal('completion_evidence'),
    v.literal('recovery'),
  ),
  semanticIdentity: v.optional(v.string()),
  inference: v.optional(v.union(v.literal('allowed'), v.literal('customer_required'))),
})
const publicInputExample = v.object({
  label: v.optional(v.string()),
  input: v.record(v.string(), v.any()), // runtime-validated JsonValue boundary
})
const publicDescriptor = v.object({
  operationRef: v.string(),
  callVia: v.literal(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path),
  paymentLane: v.literal('brokered'),
  operationId: v.string(),
  contract: v.object({
    capabilityId: v.string(),
    version: v.number(),
    inputJsonSchema: v.string(),
    outputJsonSchema: v.string(),
    customerAnnotations: v.array(publicAnnotation),
    inputExamples: v.optional(v.array(publicInputExample)),
  }),
  business: v.object({ businessId: v.string(), slug: v.string(), name: v.string() }),
  offering: v.object({ offeringRef: v.string(), revision: v.number(), label: v.string(), summary: v.string() }),
  summary: v.string(),
  commercial: v.object({ price: publicPrice, priceEvidence: v.optional(publicPriceEvidence), priceBreakdown: v.optional(publicPriceBreakdown), materialTerms: v.array(publicMaterialTerm), relationship: publicRelationship }),
  dataUse: v.array(publicDataUse),
  effects: v.array(publicEffect),
  evidence: v.array(publicEvidence),
  cancellation: publicCancellation,
  recovery: publicRecovery,
  authentication: publicAuthentication,
  transport: publicTransport,
  provenance: v.object({
    publisher: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  }),
  availability: publicAvailability,
  navigation: v.array(publicNavigation),
  parameters: v.optional(v.array(v.object({
    group: v.union(v.literal('body'), v.literal('path'), v.literal('query'), v.literal('header')),
    name: v.string(), type: v.string(),
    description: v.optional(v.string()), example: v.optional(v.any()), // runtime-validated JsonValue boundary
    enumValues: v.optional(v.array(v.string())), default: v.optional(v.any()), // runtime-validated JsonValue boundary
    required: v.boolean(),
    style: v.optional(v.union(v.literal('form'), v.literal('simple'))),
    explode: v.optional(v.boolean()),
  }))),
  catalogPrice: v.optional(v.object({
    scheme: v.union(v.literal('exact'), v.literal('upto')),
    amount: v.optional(v.string()), minAmount: v.optional(v.string()), maxAmount: v.optional(v.string()),
    currency: v.string(),
  })),
})
const publicComparisonValue = v.union(
  v.string(),
  publicPrice,
  v.array(publicEffect),
  v.array(publicDataUse),
  publicAvailability,
  v.object({
    publisher: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  }),
  publicRecovery,
)
const publicComparisonFact = v.object({
  field: v.union(v.literal('summary'), v.literal('price'), v.literal('effects'), v.literal('dataUse'), v.literal('availability'), v.literal('provenance'), v.literal('recovery')),
  values: v.array(v.object({
    operationRef: v.string(),
    value: publicComparisonValue,
    source: v.union(v.literal('publication'), v.literal('readiness'), v.literal('contract'), v.literal('catalog')),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  })),
})
const publicSearchFilters = v.object({
  networkId: v.optional(v.string()),
  location: v.optional(v.string()),
  effects: v.optional(v.array(v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')))),
  dataUse: v.optional(v.array(v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')))),
  availability: v.optional(v.array(v.union(v.literal('integrated'), v.literal('routeable'), v.literal('unavailable')))),
  currency: v.optional(v.string()),
  maximumPrice: v.optional(exactAmount),
})
const publicSearchNavigation = v.array(publicNavigation)
const publicRanking = v.object({ operationRef: v.string(), rank: v.number(), score: v.number() })
export const publicSearchReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-operations:v1'),
    query: v.string(),
    items: v.array(publicDescriptor),
    matchedCount: v.number(),
    ranking: v.array(publicRanking),
    pagination: v.object({ limit: v.number(), nextCursor: v.optional(v.string()), hasMore: v.boolean() }),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('no_candidates'),
    schemaVersion: v.literal('registry-operations:v1'),
    query: v.string(),
    appliedFilters: publicSearchFilters,
    matchedCount: v.number(),
    ranking: v.array(publicRanking),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-operations:v1'),
    reason: v.union(v.literal('query_invalid'), v.literal('source_unavailable'), v.literal('source_capacity_exceeded')),
    navigation: publicSearchNavigation,
  }),
)
export const publicDetailReturns = v.union(
  v.object({ kind: v.literal('found'), schemaVersion: v.literal('registry-operations:v1'), operation: publicDescriptor }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-operations:v1'),
    operationRef: v.string(),
    reason: v.union(
      v.literal('setup_required'),
      v.literal('temporarily_unavailable'),
      v.literal('readiness_expired'),
      v.literal('publisher_withdrew'),
      v.literal('under_review'),
      v.literal('updated_terms_require_review'),
      v.literal('not_supported_by_ae'),
    ),
    navigation: publicSearchNavigation,
  }),
  v.object({ kind: v.literal('not_found'), schemaVersion: v.literal('registry-operations:v1'), operationRef: v.string(), navigation: publicSearchNavigation }),
)
export const publicCompareReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-operations:v1'),
    operations: v.array(publicDescriptor),
    facts: v.array(publicComparisonFact),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-operations:v1'),
    reason: v.union(v.literal('query_invalid'), v.literal('operation_not_found'), v.literal('operation_unavailable')),
    navigation: publicSearchNavigation,
  }),
)
export const publicInspectReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-operations:v1'),
    inspectPlanRef: v.string(),
    operationRefs: v.array(v.string()),
    mappingRefs: v.array(v.string()),
    summary: v.object({
      maximumCost: v.union(v.object({ kind: v.literal('known'), amount: exactAmount }), v.object({ kind: v.literal('requires_preparation') })),
      dataUse: v.array(publicDataUse),
      effects: v.array(publicEffect),
      expiry: v.number(),
    }),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-operations:v1'),
    reason: v.union(
      v.literal('query_invalid'),
      v.literal('operation_not_found'),
      v.literal('operation_unavailable'),
      v.literal('mapping_unavailable'),
      v.literal('mapping_incompatible'),
      v.literal('mapping_cycle'),
    ),
    navigation: publicSearchNavigation,
  }),
)
export const searchArgs = {
  query: v.string(),
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
  filters: v.optional(publicSearchFilters),
}
export const operationRefArgs = { operationRef: v.string() }
export const compareArgs = { operationRefs: v.array(v.string()) }
export const inspectArgs = { operationRefs: v.array(v.string()), mappingRefs: v.optional(v.array(v.string())), expiresInMs: v.optional(v.number()) }

export async function searchHandler(ctx: QueryCtx, args: OperationSearchInput) {
  const now = Date.now()
  const mode = await readCurrentOperationMode(ctx)
  return serializeOperationSearchResult(mode === 'new'
    ? await searchProjectedCurrentOperations(ctx, args, now)
    : await searchCapabilityOperations(capabilityOperationSourcePort(ctx), args, now))
}
export async function detailHandler(ctx: QueryCtx, args: OperationDetailInput) {
  return serializeOperationDetailResult(await detailCapabilityOperation(capabilityOperationSourcePort(ctx), args))
}
export async function compareHandler(ctx: QueryCtx, args: OperationCompareInput) {
  return serializeOperationCompareResult(await compareCapabilityOperations(capabilityOperationSourcePort(ctx), args))
}
export async function inspectPlanHandler(ctx: QueryCtx, args: InspectPlanInput) {
  return serializeInspectPlanResult(await inspectCapabilityOperationPlan(capabilityOperationSourcePort(ctx), args))
}

const MAX_CURRENT_PROJECTION_DIAGNOSTIC_ROWS = 257

/**
 * Operator-only, bounded diagnostics for current rows that public projection
 * deliberately omits. Only aggregate labels and counts are returned: no query
 * text, Operation input, credentials, endpoint details, or raw source rows.
 */
export async function currentProjectionDiagnosticsHandler(
  ctx: QueryCtx,
  args: Readonly<{ now: number }>,
) {
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
    .take(MAX_CURRENT_PROJECTION_DIAGNOSTIC_ROWS + 1)
  const bounded = publications.slice(0, MAX_CURRENT_PROJECTION_DIAGNOSTIC_ROWS)
  const projections = await Promise.all(bounded.map((publication) => (
    operationRecordProjection(ctx, publication, args.now)
  )))
  const drops = new Map<string, number>()
  const unavailable = new Map<string, number>()
  let projectedCount = 0
  let unavailableCount = 0
  let serializedProjectionBytes = 0
  for (const projection of projections) {
    if (projection.kind === 'dropped') {
      drops.set(projection.reason, (drops.get(projection.reason) ?? 0) + 1)
      continue
    }
    projectedCount += 1
    serializedProjectionBytes += new TextEncoder().encode(JSON.stringify(projection.record)).byteLength
    if (projection.record.unavailableReason !== undefined) {
      unavailableCount += 1
      unavailable.set(
        projection.record.unavailableReason,
        (unavailable.get(projection.record.unavailableReason) ?? 0) + 1,
      )
    }
  }
  const transaction = await ctx.meta.getTransactionMetrics()
  return {
    kind: 'current_operation_projection_diagnostic' as const,
    schemaVersion: 'current-operation-projection-diagnostic:v1' as const,
    scannedCount: bounded.length,
    projectedCount,
    unavailableCount,
    dropCount: bounded.length - projectedCount,
    truncated: publications.length > MAX_CURRENT_PROJECTION_DIAGNOSTIC_ROWS,
    serializedProjectionBytes,
    databaseQueries: transaction.databaseQueries.used,
    documentsRead: transaction.documentsRead.used,
    bytesRead: transaction.bytesRead.used,
    drops: CURRENT_OPERATION_PROJECTION_DROP_REASONS.flatMap((reason) => {
      const count = drops.get(reason) ?? 0
      return count === 0 ? [] : [{ reason, count }]
    }),
    unavailable: CURRENT_OPERATION_UNAVAILABLE_REASONS.flatMap((reason) => {
      const count = unavailable.get(reason) ?? 0
      return count === 0 ? [] : [{ reason, count }]
    }),
  }
}

/** Privacy-safe Wave 0 search measurement. The search query and rows stay in-process. */
export async function currentSearchBenchmarkHandler(
  ctx: QueryCtx,
  args: OperationSearchInput,
) {
  const result = await searchHandler(ctx, args)
  const transaction = await ctx.meta.getTransactionMetrics()
  return {
    kind: 'current_operation_search_measurement' as const,
    schemaVersion: 'current-operation-search-measurement:v1' as const,
    outcome: result.kind,
    ...(result.kind === 'unavailable' ? { refusalReason: result.reason } : {}),
    itemCount: result.kind === 'ok' ? result.items.length : 0,
    matchedCount: result.kind === 'ok' || result.kind === 'no_candidates' ? result.matchedCount : 0,
    serializedResultBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
    databaseQueries: transaction.databaseQueries.used,
    documentsRead: transaction.documentsRead.used,
    bytesRead: transaction.bytesRead.used,
  }
}

function capabilityOperationSourcePort(ctx: QueryCtx): CapabilityOperationSourcePort {
  const listOld = async (
    networkId: string | undefined,
    limit: number,
    now: number,
  ): Promise<Readonly<{ operations: readonly CapabilityOperationSourceRecord[]; snapshotKey: string }>> => {
    const publications = networkId === undefined
      ? await ctx.db.query('capabilityPublications')
        .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
        .take(limit)
      : await ctx.db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', networkId).eq('disposition', 'current'))
        .take(limit)
    const records = await Promise.all(publications.map((publication) => operationRecord(ctx, publication, now)))
    return {
      operations: records.flatMap((record) => record === undefined ? [] : [record]),
      snapshotKey: `capability-supply:current:${canonicalDigest(publications.map((publication) => ({
        publicationRef: publication.publicationRef,
        operationRef: publication.operationRef,
        revision: publication.revision,
        disposition: publication.disposition,
        networkId: publication.networkId,
        credentialState: publication.credentialState,
        healthState: publication.healthState,
        readinessTargetDigest: publication.readinessTargetDigest ?? null,
        readinessRequestDigest: publication.readinessRequestDigest ?? null,
        readinessResponseStatus: publication.readinessResponseStatus ?? null,
        readinessResponseContentType: publication.readinessResponseContentType ?? null,
        readinessResponseDigest: publication.readinessResponseDigest ?? null,
        readinessOutcome: publication.readinessOutcome ?? null,
        readinessObservedAt: publication.readinessObservedAt ?? null,
        readinessValidUntil: publication.readinessValidUntil ?? null,
        readinessEvidenceRefs: [...publication.readinessEvidenceRefs].sort(),
      })))}`,
    }
  }
  const loadOld = async (operationRef: string) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_operationRef_and_disposition', (query) => (
        query.eq('operationRef', operationRef).eq('disposition', 'current')
      ))
      .unique()
    if (publication === null) return null
    return await operationRecord(ctx, publication, Date.now()) ?? null
  }
  return {
    listCurrent: async (input) => {
      return await listOld(input.networkId, input.limit, input.now)
    },
    loadCurrent: async (operationRef) => {
      const mode = await readCurrentOperationMode(ctx)
      if (mode === 'new') return await loadProjectedCurrentOperation(ctx, operationRef)
      return await loadOld(operationRef)
    },
    resolveMapping: async (mappingRef, networkId) => {
      if (networkId === undefined) return null
      const row = await ctx.db.query('registeredOperationMappings')
        .withIndex('by_networkId_and_mappingRef', (query) => (
          query.eq('networkId', networkId).eq('mappingRef', mappingRef)
        ))
        .unique()
      return row === null ? null : toRegisteredOperationMapping(row)
    },
  }
}
