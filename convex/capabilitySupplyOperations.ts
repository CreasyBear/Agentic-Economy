import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareCapabilityOperations,
  detailCapabilityOperation,
  inspectCapabilityOperationPlan,
  capabilityOperationId,
  createPublicOperationRef,
  projectCapabilityOperation,
  serializeOperationCompareResult,
  serializeOperationDetailResult,
  serializeOperationSearchResult,
  serializeInspectPlanResult,
  searchCapabilityOperations,
  type CapabilityBindingRow,
  type CapabilityOfferingRow,
  type CapabilityOperationSourcePort,
  type CapabilityOperationSourceRecord,
  type InspectPlanInput,
  type OperationCompareInput,
  type OperationDetailInput,
  type OperationSearchInput,
} from '@/modules/capability-supply/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { toCapabilityBindingRow, toCapabilityOfferingRow, toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
const publicPrice = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({ kind: v.literal('range'), currency: v.string(), minimumAmountMinor: v.number(), maximumAmountMinor: v.number() }),
  v.object({ kind: v.literal('on_request') }),
)
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
const publicNavigation = v.object({
  relation: v.union(
    v.literal('search'),
    v.literal('detail'),
    v.literal('compare'),
    v.literal('inspect_plan'),
    v.literal('authenticate'),
    v.literal('create_customer_request'),
    v.literal('review_route'),
    v.literal('read_status'),
    v.literal('reconcile'),
    v.literal('cancel'),
  ),
  method: v.union(v.literal('GET'), v.literal('POST')),
  actionId: v.string(),
  authentication: v.union(v.literal('none'), v.literal('required')),
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
const publicDescriptor = v.object({
  operationRef: v.string(),
  operationId: v.string(),
  contract: v.object({
    capabilityId: v.string(),
    version: v.number(),
    inputJsonSchema: v.string(),
    outputJsonSchema: v.string(),
    customerAnnotations: v.array(publicAnnotation),
  }),
  business: v.object({ businessId: v.string(), slug: v.string(), name: v.string() }),
  offering: v.object({ offeringRef: v.string(), revision: v.number(), label: v.string(), summary: v.string() }),
  summary: v.string(),
  commercial: v.object({ price: publicPrice, materialTerms: v.array(publicMaterialTerm), relationship: publicRelationship }),
  dataUse: v.array(publicDataUse),
  effects: v.array(publicEffect),
  evidence: v.array(publicEvidence),
  cancellation: publicCancellation,
  recovery: publicRecovery,
  provenance: v.object({
    publisher: v.union(v.literal('provider_owned'), v.literal('ae_curated_external')),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
  }),
  availability: publicAvailability,
  navigation: v.array(publicNavigation),
})
const publicComparisonValue = v.union(
  v.string(),
  publicPrice,
  v.array(publicEffect),
  v.array(publicDataUse),
  publicAvailability,
  v.object({
    publisher: v.union(v.literal('provider_owned'), v.literal('ae_curated_external')),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
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
  maximumPriceMinor: v.optional(v.number()),
})
const publicSearchNavigation = v.array(publicNavigation)
const publicSearchReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-operations:v1'),
    query: v.string(),
    items: v.array(publicDescriptor),
    pagination: v.object({ limit: v.number(), nextCursor: v.optional(v.string()), hasMore: v.boolean() }),
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('no_candidates'),
    schemaVersion: v.literal('registry-operations:v1'),
    query: v.string(),
    appliedFilters: publicSearchFilters,
    navigation: publicSearchNavigation,
  }),
  v.object({
    kind: v.literal('unavailable'),
    schemaVersion: v.literal('registry-operations:v1'),
    reason: v.union(v.literal('query_invalid'), v.literal('source_unavailable'), v.literal('source_capacity_exceeded')),
    navigation: publicSearchNavigation,
  }),
)
const publicDetailReturns = v.union(
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
const publicCompareReturns = v.union(
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
const publicInspectReturns = v.union(
  v.object({
    kind: v.literal('ok'),
    schemaVersion: v.literal('registry-operations:v1'),
    inspectPlanRef: v.string(),
    operationRefs: v.array(v.string()),
    mappingRefs: v.array(v.string()),
    summary: v.object({
      maximumCost: v.union(v.object({ kind: v.literal('known'), currency: v.string(), amountMinor: v.number() }), v.object({ kind: v.literal('requires_preparation') })),
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
const searchArgs = {
  query: v.string(),
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
  filters: v.optional(publicSearchFilters),
}
const operationRefArgs = { operationRef: v.string() }
const compareArgs = { operationRefs: v.array(v.string()) }
const inspectArgs = { operationRefs: v.array(v.string()), mappingRefs: v.optional(v.array(v.string())), expiresInMs: v.optional(v.number()) }

export const search = queryGeneric({
  args: searchArgs,
  returns: publicSearchReturns,
  handler: async (ctx, args) => serializeOperationSearchResult(await searchCapabilityOperations(capabilityOperationSourcePort(ctx), args)),
})
export const detail = queryGeneric({
  args: operationRefArgs,
  returns: publicDetailReturns,
  handler: async (ctx, args) => serializeOperationDetailResult(await detailCapabilityOperation(capabilityOperationSourcePort(ctx), args)),
})
export const compare = queryGeneric({
  args: compareArgs,
  returns: publicCompareReturns,
  handler: async (ctx, args) => serializeOperationCompareResult(await compareCapabilityOperations(capabilityOperationSourcePort(ctx), args)),
})
export const inspectPlan = queryGeneric({
  args: inspectArgs,
  returns: publicInspectReturns,
  handler: async (ctx, args) => serializeInspectPlanResult(await inspectCapabilityOperationPlan(capabilityOperationSourcePort(ctx), args)),
})

function capabilityOperationSourcePort(ctx: QueryCtx): CapabilityOperationSourcePort {
  const list = async (networkId: string | undefined, limit: number, now: number): Promise<CapabilityOperationSourceRecord[]> => {
    const publications = networkId === undefined
      ? await ctx.db.query('capabilityPublications').take(limit)
      : await ctx.db.query('capabilityPublications').withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', networkId).eq('disposition', 'current')).take(limit)
    const current = networkId === undefined ? publications.filter((publication) => publication.disposition === 'current') : publications
    const records = await Promise.all(current.map((publication) => operationRecord(ctx, publication, now)))
    return records.flatMap((record) => record === undefined ? [] : [record])
  }
  return {
    listCurrent: async (input) => ({ operations: await list(input.networkId, input.limit, input.now), snapshotKey: `capability-supply:current:${Math.floor(input.now / 60_000)}` }),
    loadCurrent: async (operationRef) => {
      const records = await list(undefined, 257, Date.now())
      return records.find((record) => projectCapabilityOperation(record).operationRef === operationRef) ?? null
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

async function operationRecord(ctx: QueryCtx, publication: Doc<'capabilityPublications'>, now: number): Promise<CapabilityOperationSourceRecord | undefined> {
  const [offeringDoc, bindingDoc, business, contractResult] = await Promise.all([
    ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique(),
    ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique(),
    ctx.db.get(publication.businessId),
    getExactRegisteredCapabilityContract(ctx.db, { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest }),
  ])
  const operationId = capabilityOperationId(publication.capabilityId)
  const operationRef = createPublicOperationRef({
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest },
  })
  if (publication.operationRef !== operationRef) return undefined
  if (offeringDoc === null || bindingDoc === null || business === null || contractResult.kind !== 'found') return undefined
  if (business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined) return undefined
  const offering = toCapabilityOfferingRow(offeringDoc)
  const binding = toCapabilityBindingRow(bindingDoc)
  const lifecycle = publicationLifecycleForSource(publication, offering, binding, now)
  const integrated = offering.status === 'active' && binding.admission === 'admitted' && binding.conformance === 'conformant'
  const routeable = integrated && lifecycle === 'active'
  const unavailableReason = routeable ? undefined : publicUnavailableReason(publication, lifecycle, now)
  const authorityMode = publication.authorityMode
  return {
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    networkId: publication.networkId,
    contract: contractResult.contract,
    business: { businessId: String(business._id), slug: business.slug, name: business.name },
    offering: { offeringRef: offering.origin?.kind === 'catalog_offering' ? offering.origin.offeringRef : offering.offeringId, revision: offering.origin?.kind === 'catalog_offering' ? offering.origin.offeringRevision : 1, label: offering.presentation.label, summary: offering.presentation.summary },
    price: offering.presentation.price,
    materialTerms: offering.presentation.materialTerms.map(({ label, value }) => ({ label, value })),
    commercialRelationship: { kind: offering.presentation.commercialRelationship.kind, summary: offering.presentation.commercialRelationship.summary },
    cancellation: { kind: binding.cancellation.kind },
    provenance: { publisher: authorityMode, sourceKind: publication.sourceKind },
    integrated, routeable, ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: { ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }), ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }) },
    searchTerms: offering.searchTerms,
    snapshotKey: `publication:${publication.publicationRef}:${publication.revision}`,
  }
}
function publicationLifecycleForSource(publication: Doc<'capabilityPublications'>, offering: CapabilityOfferingRow, binding: CapabilityBindingRow, now: number): 'active' | 'inactive' {
  if (publication.disposition !== 'current' || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant') return 'inactive'
  if (publication.credentialState !== 'ready' || publication.healthState !== 'healthy' || publication.readinessValidUntil === undefined || publication.readinessValidUntil <= now) return 'inactive'
  return 'active'
}

function publicUnavailableReason(publication: Doc<'capabilityPublications'>, lifecycle: 'active' | 'inactive', now: number): CapabilityOperationSourceRecord['unavailableReason'] {
  if (publication.readinessValidUntil !== undefined && publication.readinessValidUntil <= now) return 'readiness_expired'
  if (publication.healthState === 'unhealthy') return 'temporarily_unavailable'
  if (publication.disposition === 'withdrawn') return 'publisher_withdrew'
  if (lifecycle !== 'active') return 'setup_required'
  return 'not_supported_by_ae'
}
