import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import {
  compareCapabilityOperations,
  detailCapabilityOperation,
  capabilityOperationId,
  createPublicOperationRef,
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  parseAdmittedX402CatalogPayment,
  parseAdmittedTransportCatalogMetadata,
  parseHttpJsonTransportConfiguration,
  inspectCapabilityOperationPlan,
  projectCapabilityOperation,
  serializeOperationCompareResult,
  serializeOperationDetailResult,
  serializeOperationSearchResult,
  serializeInspectPlanResult,
  searchCapabilityOperations,
  MAX_ELIGIBLE_SUPPLY,
  type CapabilityBindingRow,
  type CapabilityOfferingRow,
  type CapabilityOperationSourcePort,
  type CapabilityOperationSourceRecord,
  type CatalogOfferingOperationMapEntry,
  type HttpJsonTransportConfiguration,
  type InspectPlanInput,
  type OperationCompareInput,
  type OperationDetailInput,
  type OperationSearchInput,
} from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'
import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'

import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { toCapabilityBindingRow, toCapabilityOfferingRow, toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
const exactAmount = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const publicPrice = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmount }),
  v.object({ kind: v.literal('range'), minimum: exactAmount, maximum: exactAmount }),
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
    publisher: v.union(
      v.literal('provider_owned'), v.literal('ae_curated_external'),
      v.literal('third_party_gateway'), v.literal('observed_external'),
    ),
    sourceKind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  }),
  availability: publicAvailability,
  navigation: v.array(publicNavigation),
  parameters: v.optional(v.array(v.object({
    group: v.union(v.literal('body'), v.literal('path'), v.literal('query')),
    name: v.string(), type: v.string(),
    description: v.optional(v.string()), example: v.optional(v.any()), // runtime-validated JsonValue boundary
    enumValues: v.optional(v.array(v.string())), default: v.optional(v.any()), // runtime-validated JsonValue boundary
    required: v.boolean(),
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

/**
 * W1 origin seam: one exact admitted capability-operation entry per catalog
 * access path. Entries deliberately carry only public lineage, transport and
 * readiness facts; credential references/configuration never cross this query.
 */
const publicCatalogPrice = v.object({
  scheme: v.union(v.literal('exact'), v.literal('upto')),
  amount: v.optional(v.string()),
  minAmount: v.optional(v.string()),
  maxAmount: v.optional(v.string()),
  currency: v.string(),
})
const publicPayment = v.object({
  network: v.string(),
  asset: v.string(),
  currency: v.string(),
  routeAmountExponent: v.number(),
  assetAmountExponent: v.number(),
})
const publicParameter = v.object({
  group: v.union(v.literal('body'), v.literal('path'), v.literal('query')),
  name: v.string(),
  type: v.string(),
  description: v.optional(v.string()),
  example: v.optional(v.any()), // runtime-validated JsonValue boundary
  enumValues: v.optional(v.array(v.string())),
  default: v.optional(v.any()), // runtime-validated JsonValue boundary
  required: v.boolean(),
})
const publicAuthentication = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({
    kind: v.literal('platform_credential'),
    scheme: v.literal('api_key'),
    in: v.union(v.literal('query'), v.literal('header')),
    name: v.string(),
  }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('bearer') }),
  v.object({ kind: v.literal('x402') }),
  v.object({ kind: v.literal('unknown') }),
)
const publicReadiness = v.object({
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})
const offeringOperationMapReturns = v.array(v.object({
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  declaredAccessPathRef: v.string(),
  accessPathSourceHash: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  authorityMode: v.union(
    v.literal('provider_owned'),
    v.literal('ae_curated_external'),
    v.literal('third_party_gateway'),
    v.literal('observed_external'),
  ),
  sourceKind: v.union(
    v.literal('ae_envelope'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('agent_plugin_mcp'),
    v.literal('x402'),
  ),
  authentication: publicAuthentication,
  routeable: v.boolean(),
  answerExecutable: v.boolean(),
  readiness: publicReadiness,
  operationRef: v.string(),
  parameters: v.optional(v.array(publicParameter)),
  catalogPrice: v.optional(publicCatalogPrice),
  payment: v.optional(publicPayment),
}))

export const offeringOperationMap = queryGeneric({
  args: { businessIds: v.array(v.string()) },
  returns: offeringOperationMapReturns,
  handler: async (ctx, args) => {
    const entries = await buildOfferingOperationMap(ctx, args.businessIds, Date.now())
    return entries.map((entry) => ({
      offeringRef: entry.offeringRef,
      offeringRevision: entry.offeringRevision,
      offeringSourceHash: entry.offeringSourceHash,
      declaredAccessPathRef: entry.declaredAccessPathRef,
      accessPathSourceHash: entry.accessPathSourceHash,
      endpointUrl: entry.endpointUrl,
      method: entry.method,
      authorityMode: entry.authorityMode,
      sourceKind: entry.sourceKind,
      authentication: entry.authentication,
      routeable: entry.routeable,
      answerExecutable: entry.answerExecutable,
      readiness: {
        ...(entry.readiness.observedAt === undefined ? {} : { observedAt: entry.readiness.observedAt }),
        ...(entry.readiness.validUntil === undefined ? {} : { validUntil: entry.readiness.validUntil }),
      },
      operationRef: entry.operationRef,
      ...(entry.parameters === undefined
        ? {}
        : {
            parameters: entry.parameters.map((parameter) => ({
              group: parameter.group,
              name: parameter.name,
              type: parameter.type,
              ...(parameter.description === undefined ? {} : { description: parameter.description }),
              ...(parameter.example === undefined ? {} : { example: parameter.example }),
              ...(parameter.enumValues === undefined ? {} : { enumValues: [...parameter.enumValues] }),
              ...(parameter.default === undefined ? {} : { default: parameter.default }),
              required: parameter.required,
            })),
          }),
      ...(entry.catalogPrice === undefined
        ? {}
        : {
            catalogPrice: {
              scheme: entry.catalogPrice.scheme,
              ...(entry.catalogPrice.amount === undefined ? {} : { amount: entry.catalogPrice.amount }),
              ...(entry.catalogPrice.minAmount === undefined ? {} : { minAmount: entry.catalogPrice.minAmount }),
              ...(entry.catalogPrice.maxAmount === undefined ? {} : { maxAmount: entry.catalogPrice.maxAmount }),
              currency: entry.catalogPrice.currency,
            },
          }),
      ...(entry.payment === undefined
        ? {}
        : {
            payment: {
              network: entry.payment.network,
              asset: entry.payment.asset,
              currency: entry.payment.currency,
              routeAmountExponent: entry.payment.routeAmountExponent,
              assetAmountExponent: entry.payment.assetAmountExponent,
            },
          }),
    }))
  },
})

async function buildOfferingOperationMap(
  ctx: QueryCtx,
  businessIds: readonly string[],
  now: number,
): Promise<CatalogOfferingOperationMapEntry[]> {
  if (businessIds.length === 0) return []
  const entries: CatalogOfferingOperationMapEntry[] = []
  for (const businessId of businessIds) {
    const publications = await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (query) => (
        query.eq('businessId', businessId as Id<'businesses'>).eq('disposition', 'current')
      ))
      .take(MAX_ELIGIBLE_SUPPLY + 1)
    if (publications.length > MAX_ELIGIBLE_SUPPLY) continue
    for (const publication of publications) {
      const [offeringDoc, bindingDoc] = await Promise.all([
        ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
          .unique(),
        ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
          .unique(),
      ])
      const origin = offeringDoc?.origin
      if (
        origin?.kind !== 'catalog_offering'
        || origin.offeringSourceHash === undefined
        || origin.declaredAccessPathRef === undefined
        || origin.accessPathSourceHash === undefined
      ) continue
      if (!await eligibleSupplyPorts(ctx.db).catalogOriginIsCurrent(origin, businessId)) continue
      const record = await operationRecord(ctx, publication, now)
      if (record === undefined || !record.integrated || bindingDoc === null) continue
      if (
        record.offering.offeringRef !== origin.offeringRef
        || record.offering.revision !== origin.offeringRevision
      ) continue
      const transport = parseAdmittedTransportCatalogMetadata(bindingDoc.adapterId, bindingDoc.configJson)
      if (transport === undefined) continue
      const payment = bindingDoc.admission !== 'admitted' || bindingDoc.conformance !== 'conformant'
        ? undefined
        : parseAdmittedX402CatalogPayment(bindingDoc.adapterId, bindingDoc.configJson)
      const descriptor = projectCapabilityOperation(record, now)
      const queryPointers = new Set(transport.queryInputPointers)
      const parameters = descriptor.parameters?.map((parameter) => ({
        ...parameter,
        group: queryPointers.has(`/${parameter.name.replace(/~/g, '~0').replace(/\//g, '~1')}`)
          ? 'query' as const
          : parameter.group,
      }))
      const answerExecutable = record.routeable
        && bindingDoc.authority.kind === 'keyless'
        && bindingDoc.adapterId === 'http-json:v1'
        && record.provenance.sourceKind !== 'x402'
        && parseHttpJsonMessageConfig(bindingDoc.configJson)?.method === 'GET'
      entries.push({
        offeringRef: origin.offeringRef,
        offeringRevision: origin.offeringRevision,
        offeringSourceHash: origin.offeringSourceHash,
        declaredAccessPathRef: origin.declaredAccessPathRef,
        accessPathSourceHash: origin.accessPathSourceHash,
        endpointUrl: bindingDoc.endpointUrl,
        method: transport.method,
        authorityMode: record.provenance.publisher,
        sourceKind: record.provenance.sourceKind,
        authentication: publicAuthenticationFor(bindingDoc.authority, record.provenance.sourceKind, bindingDoc.adapterId, bindingDoc.configJson),
        routeable: record.routeable,
        answerExecutable,
        readiness: record.readiness,
        operationRef: descriptor.operationRef,
        ...(parameters === undefined ? {} : { parameters }),
        ...(descriptor.catalogPrice === undefined ? {} : { catalogPrice: descriptor.catalogPrice }),
        ...(payment === undefined ? {} : { payment }),
      })
    }
  }
  return entries.sort((left, right) => (
    left.offeringRef.localeCompare(right.offeringRef)
    || left.declaredAccessPathRef.localeCompare(right.declaredAccessPathRef)
    || left.operationRef.localeCompare(right.operationRef)
  ))
}

function publicAuthenticationFor(
  authority: CapabilityBindingRow['authority'],
  sourceKind: CatalogOfferingOperationMapEntry['sourceKind'],
  adapterId: string,
  configJson: string,
): CatalogOfferingOperationMapEntry['authentication'] {
  if (sourceKind === 'x402' || adapterId === 'x402-fetch:v2') return { kind: 'x402' }
  if (authority.kind === 'keyless') return { kind: 'keyless' }
  const placement = parseHttpJsonMessageConfig(configJson)?.credential
  if (placement?.kind === 'api_key') {
    return { kind: 'platform_credential', scheme: 'api_key', in: placement.location, name: placement.name }
  }
  if (placement?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
  return { kind: 'unknown' }
}

// Executable-keyless descriptor: the server-side reader behind operation.execute.
// It never reaches the browser (only the public wire descriptor does); it feeds
// the server execution seam with the DB's own endpoint/config/schema.
// Fail-closed: only currently-routeable, keyless, http-json:v1 GET operations
// that are NOT observed x402 listings are emitted.
const executableQueryMapping = v.object({ inputPointer: v.string(), parameter: v.string() })
const executableFixedQuery = v.object({ parameter: v.string(), value: v.string() })
const authorityValue = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({
    kind: v.literal('provider_connection'),
    connectionRef: v.string(),
    providerRef: v.string(),
  }),
)
const keylessExecutableDescriptor = v.object({
  operationRef: v.string(),
  capabilityId: v.string(),
  name: v.string(),
  summary: v.string(),
  searchTerms: v.array(v.string()),
  endpointUrl: v.string(),
  authority: authorityValue,
  adapterId: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  query: v.optional(v.array(executableQueryMapping)),
  fixedQuery: v.optional(v.array(executableFixedQuery)),
  requestTimeoutMs: v.number(),
  inputSchemaJson: v.string(),
  outputSchemaJson: v.optional(v.string()),
  provenance: v.object({ publisher: v.string(), sourceKind: v.string() }),
})
const keylessExecutableReturns = v.union(keylessExecutableDescriptor, v.null())

export const readKeylessExecutable = queryGeneric({
  args: { operationRef: v.string() },
  returns: keylessExecutableReturns,
  handler: async (ctx, input) => readKeylessExecutableImpl(ctx, input.operationRef, Date.now()),
})

// The answer agent's dynamic-capability tool catalog: every currently
// executable keyless op, exposed eagerly so the model can call an op by its
// own DB-driven strict input schema. Deliberately lean (no endpoint/credential:
// those stay behind the per-invocation readKeylessExecutable reader). Same
// fail-closed gates as the single reader; a keyed, x402, or non-http-json-GET
const keylessExecutableListing = v.object({
  operationRef: v.string(),
  capabilityId: v.string(),
  name: v.string(),
  summary: v.string(),
  searchTerms: v.array(v.string()),
  inputSchemaJson: v.string(),
  inputExamplesJson: v.optional(v.string()),
})
const keylessExecutableListReturns = v.array(keylessExecutableListing)

export const listKeylessExecutable = queryGeneric({
  args: {},
  returns: keylessExecutableListReturns,
  handler: async (ctx) => listKeylessExecutableImpl(ctx, Date.now()),
})

async function listKeylessExecutableImpl(
  ctx: QueryCtx,
  now: number,
): Promise<Array<{
  operationRef: string
  capabilityId: string
  name: string
  summary: string
  searchTerms: string[]
  inputSchemaJson: string
  inputExamplesJson?: string
}>> {
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (q) => q.eq('disposition', 'current'))
    .take(512)
  const out: Array<{
    operationRef: string
    capabilityId: string
    name: string
    summary: string
    searchTerms: string[]
    inputSchemaJson: string
    inputExamplesJson?: string
  }> = []
  for (const publication of publications) {
    if (publication.sourceKind === 'x402') continue
    const [offeringDoc, bindingDoc, business, contractResult] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId))
        .unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId))
        .unique(),
      ctx.db.get(publication.businessId),
      getExactRegisteredCapabilityContract(ctx.db, {
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
      }),
    ])
    if (offeringDoc === null || bindingDoc === null || business === null || contractResult.kind !== 'found') continue
    const offering = toCapabilityOfferingRow(offeringDoc)
    const binding = toCapabilityBindingRow(bindingDoc)
    if (publicationLifecycleForSource(publication, offering, binding, now) !== 'active'
      || business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined
      || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant') {
      continue
    }
    if (binding.authority.kind !== 'keyless' || binding.adapterId !== 'http-json:v1') continue
    const config = parseHttpJsonMessageConfig(binding.configJson)
    if (config === undefined || config.method !== 'GET') continue
    out.push({
      operationRef: createPublicOperationRef({
        operationId: capabilityOperationId(publication.capabilityId),
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      }),
      capabilityId: publication.capabilityId,
      name: offering.presentation.label,
      summary: contractResult.contract.description,
      searchTerms: [...offering.searchTerms],
      inputSchemaJson: JSON.stringify(contractResult.contract.inputSchema),
      ...(contractResult.contract.inputExamples === undefined
        ? {}
        : { inputExamplesJson: JSON.stringify(contractResult.contract.inputExamples) }),
    })
  }
  return out
}

async function readKeylessExecutableImpl(
  ctx: QueryCtx,
  operationRef: string,
  now: number,
): Promise<{
  operationRef: string
  capabilityId: string
  name: string
  endpointUrl: string
  summary: string
  searchTerms: string[]
  authority: CapabilityBindingRow['authority']
  adapterId: string
  method: 'GET' | 'POST'
  query?: { inputPointer: string; parameter: string }[]
  fixedQuery?: { parameter: string; value: string }[]
  requestTimeoutMs: number
  inputSchemaJson: string
  outputSchemaJson?: string
  provenance: { publisher: string; sourceKind: string }
} | null> {
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (q) => q.eq('disposition', 'current'))
    .take(1024)
  for (const publication of publications) {
    const candidateRef = createPublicOperationRef({
      operationId: capabilityOperationId(publication.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: {
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
      },
    })
    if (candidateRef !== operationRef) continue
    const [offeringDoc, bindingDoc, business, contractResult] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId))
        .unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId))
        .unique(),
      ctx.db.get(publication.businessId),
      getExactRegisteredCapabilityContract(ctx.db, {
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
      }),
    ])
    if (offeringDoc === null || bindingDoc === null || business === null || contractResult.kind !== 'found') return null
    const offering = toCapabilityOfferingRow(offeringDoc)
    const binding = toCapabilityBindingRow(bindingDoc)
    if (publicationLifecycleForSource(publication, offering, binding, now) !== 'active'
      || business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined
      || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant') {
      return null
    }
    if (binding.authority.kind !== 'keyless' || binding.adapterId !== 'http-json:v1') return null
    if (publication.sourceKind === 'x402') return null
    const config = parseHttpJsonMessageConfig(binding.configJson)
    if (config === undefined || config.method !== 'GET') return null
    return {
      operationRef,
      capabilityId: publication.capabilityId,
      name: offering.presentation.label,
      summary: contractResult.contract.description,
      searchTerms: [...offering.searchTerms],
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      adapterId: binding.adapterId,
      method: config.method,
      ...(config.query === undefined || config.query.length === 0 ? {} : { query: [...config.query] }),
      ...(config.fixedQuery === undefined || config.fixedQuery.length === 0 ? {} : { fixedQuery: [...config.fixedQuery] }),
      requestTimeoutMs: config.requestTimeoutMs,
      inputSchemaJson: JSON.stringify(contractResult.contract.inputSchema),
      ...(contractResult.contract.outputSchema === undefined
        ? {}
        : { outputSchemaJson: JSON.stringify(contractResult.contract.outputSchema) }),
      provenance: { publisher: publication.authorityMode, sourceKind: publication.sourceKind },
    }
  }
  return null
}

function parseHttpJsonMessageConfig(configJson: string): HttpJsonTransportConfiguration | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(configJson)
  } catch {
    return undefined
  }
  return parseHttpJsonTransportConfiguration(parsed)
}

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
  const offering = toCapabilityOfferingRow(offeringDoc)
  const binding = toCapabilityBindingRow(bindingDoc)
  if (business.publicStatus !== 'published' || business.claimStatus !== 'published' || business.suppressedAt !== undefined) return undefined
  const providerAuthority = binding.authority.kind === 'provider_connection'
    ? binding.authority
    : undefined
  const connectionRef = providerAuthority?.connectionRef
  const connectionDoc = connectionRef === undefined
    ? null
    : await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  const currentConnection = connectionDoc === null ? undefined : providerConnectionFromDoc(connectionDoc)
  const lifecycle = publicationLifecycleForSource(publication, offering, binding, now, currentConnection)
  const integrated = offering.status === 'active' && binding.admission === 'admitted' && binding.conformance === 'conformant'
  const routeable = integrated && lifecycle === 'active'
  const unavailableReason = routeable ? undefined : publicUnavailableReason(publication, lifecycle, now)
  const authorityMode = publication.authorityMode
  const sourcePrice = offering.presentation.price
  return {
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    networkId: publication.networkId,
    contract: contractResult.contract,
    business: { businessId: String(business._id), slug: business.slug, name: business.name },
    offering: {
      offeringRef: offering.origin?.kind === 'catalog_offering' ? offering.origin.offeringRef : offering.offeringId,
      revision: offering.origin?.kind === 'catalog_offering' ? offering.origin.offeringRevision : 1,
      label: offering.presentation.label,
      summary: offering.presentation.summary,
    },
    price: sourcePrice,
    materialTerms: offering.presentation.materialTerms.map(({ label, value }) => ({ label, value })),
    commercialRelationship: {
      kind: offering.presentation.commercialRelationship.kind,
      summary: offering.presentation.commercialRelationship.summary,
    },
    cancellation: { kind: binding.cancellation.kind },
    provenance: { publisher: authorityMode, sourceKind: publication.sourceKind },
    integrated,
    routeable,
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: {
      ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
    },
    searchTerms: offering.searchTerms,
    snapshotKey: `publication:${publication.publicationRef}:${publication.revision}`,
  }
}

function publicationLifecycleForSource(
  publication: Doc<'capabilityPublications'>,
  offering: CapabilityOfferingRow,
  binding: CapabilityBindingRow,
  now: number,
  currentConnection?: ProviderConnection,
): 'active' | 'inactive' {
  if (publication.disposition !== 'current' || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant') return 'inactive'
  if (binding.authority.kind === 'provider_connection'
    && (
      !connectionAuthoritySnapshotMatches(binding.connectionAuthority, currentConnection, {
        businessId: String(offering.businessId),
        operationRef: publication.operationRef,
        adapterId: binding.adapterId,
        now,
      })
      || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
    )) return 'inactive'
  if (publication.credentialState !== 'ready' || publication.healthState !== 'healthy' || publication.readinessValidUntil === undefined || publication.readinessValidUntil <= now) return 'inactive'
  return 'active'
}
function providerConnectionFromDoc(
  row: Doc<'capabilityProviderConnections'>,
): ProviderConnection {
  return {
    connectionRef: row.connectionRef,
    businessId: String(row.businessId),
    providerRef: row.providerRef,
    providerAccountRef: row.providerAccountRef,
    adapterId: row.adapterId,
    credentialRef: row.credentialRef,
    grantedScopes: row.grantedScopes,
    grantedResources: row.grantedResources,
    authorityGeneration: row.authorityGeneration,
    authorityDigest: row.authorityDigest,
    lifecycle: row.lifecycle,
    observedAt: row.observedAt,
    ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
    ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
    ...(row.reasonCode === undefined ? {} : { reasonCode: row.reasonCode }),
    evidenceRefs: row.evidenceRefs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastCommandId: row.lastCommandId,
    lastCommandDigest: row.lastCommandDigest,
  }
}

function publicUnavailableReason(publication: Doc<'capabilityPublications'>, lifecycle: 'active' | 'inactive', now: number): CapabilityOperationSourceRecord['unavailableReason'] {
  if (publication.readinessValidUntil !== undefined && publication.readinessValidUntil <= now) return 'readiness_expired'
  if (publication.healthState === 'unhealthy') return 'temporarily_unavailable'
  if (publication.disposition === 'withdrawn') return 'publisher_withdrew'
  if (lifecycle !== 'active') return 'setup_required'
  return 'not_supported_by_ae'
}
