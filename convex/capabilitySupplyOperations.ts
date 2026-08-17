import { internalQueryGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'

import {
  isAnonymousKeylessOperationEligible,
  compareCapabilityOperations,
  detailCapabilityOperation,
  capabilityOperationId,
  createPublicOperationRef,
  inspectCapabilityOperationPlan,
  parseAdmittedX402CatalogPayment,
  parseAdmittedTransportCatalogMetadata,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseX402FetchTransportConfiguration,
  projectCapabilityOperation,
  serializeOperationCompareResult,
  serializeOperationDetailResult,
  serializeOperationSearchResult,
  serializeInspectPlanResult,
  searchCapabilityOperations,
  qualifySuppliedCandidate,
  MAX_ELIGIBLE_SUPPLY,
  admitRegisteredTransport,
  defineCapabilityTransportBindingRegistration,
  materializePublishedOperation,
  type PublishedOperation,
  type PublicOperationParameterMapping,
  type PublicOperationTransport,
  type CapabilityBindingRow,
  type CapabilityOperationSourcePort,
  type CapabilityOperationSourceRecord,
  type CatalogOfferingOperationMapEntry,
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
  type HttpJsonTransportConfiguration,
  type InspectPlanInput,
  type OperationCompareInput,
  type OperationDetailInput,
  type OperationSearchInput,
  offeringRegistrationFromRow,
} from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import type { Doc, Id } from './_generated/dataModel'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { env, type QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
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
const publicAuthentication = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('api_key'), in: v.union(v.literal('query'), v.literal('header')), name: v.string() }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('bearer') }),
  v.object({ kind: v.literal('x402') }),
  v.object({ kind: v.literal('unknown') }),
)
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
    v.literal('answerThread'),
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
  commercial: v.object({ price: publicPrice, priceEvidence: v.optional(publicPriceEvidence), materialTerms: v.array(publicMaterialTerm), relationship: publicRelationship }),
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
const publicSearchReturns = v.union(
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
  group: v.union(v.literal('body'), v.literal('path'), v.literal('query'), v.literal('header')),
  name: v.string(),
  type: v.string(),
  description: v.optional(v.string()),
  example: v.optional(v.any()), // runtime-validated JsonValue boundary
  enumValues: v.optional(v.array(v.string())),
  default: v.optional(v.any()), // runtime-validated JsonValue boundary
  required: v.boolean(),
  style: v.optional(v.union(v.literal('form'), v.literal('simple'))),
  explode: v.optional(v.boolean()),
})
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
              ...(parameter.style === undefined ? {} : { style: parameter.style }),
              ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
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
      const record = await operationRecord(ctx, publication, now)
      if (record === undefined || !record.integrated || bindingDoc === null) continue
      if (
        record.offering.offeringRef !== origin.offeringRef
        || record.offering.revision !== origin.offeringRevision
      ) continue
      const transport = parseAdmittedTransportCatalogMetadata(bindingDoc.adapterId, bindingDoc.configJson)
      if (transport === undefined) continue
      const descriptor = projectCapabilityOperation(record, now)
      const exactRouteable = record.routeable
      const payment = bindingDoc.admission !== 'admitted' || bindingDoc.conformance !== 'conformant'
        ? undefined
        : parseAdmittedX402CatalogPayment(bindingDoc.adapterId, bindingDoc.configJson)
      const queryPointers = new Set(transport.queryInputPointers)
      const parameters = descriptor.parameters?.map((parameter) => ({
        ...parameter,
        group: queryPointers.has(`/${parameter.name.replace(/~/g, '~0').replace(/\//g, '~1')}`)
          ? 'query' as const
          : parameter.group,
      }))
      const answerExecutable = exactRouteable && record.answerExecutable
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
        routeable: exactRouteable,
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
  const config = parseTransportConfig(configJson)
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    if (parsed?.credential?.kind === 'api_key') {
      return { kind: 'platform_credential', scheme: 'api_key', in: parsed.credential.location, name: parsed.credential.name }
    }
    if (parsed?.credential?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
    if (parsed?.credential?.kind === 'none') return authority.kind === 'keyless' ? { kind: 'keyless' } : { kind: 'unknown' }
    if (parsed?.credential === undefined && authority.kind === 'keyless') return { kind: 'keyless' }
  }
  if (adapterId === 'mcp-jsonrpc:v1') {
    const parsed = parseMcpJsonRpcTransportConfiguration(config)
    if (parsed?.credential?.kind === 'api_key') {
      return { kind: 'platform_credential', scheme: 'api_key', in: parsed.credential.location, name: parsed.credential.name }
    }
    if (parsed?.credential?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
    if (parsed?.credential === undefined && authority.kind === 'keyless') return { kind: 'keyless' }
  }
  return { kind: 'unknown' }
}

// Executable-keyless descriptor: the server-side reader behind operation.execute.
// It never reaches the browser (only the public wire descriptor does); it feeds
// the server execution seam with the DB's own endpoint/config/schema.
// Fixed query values are released only to an AE_CONVEX_SERVER_FUNCTION_TOKEN-
// authorized server caller. Fail-closed: only currently-routeable, keyless,
// http-json:v1 operations that are NOT observed x402 listings are emitted.
const executableQueryMapping = v.object({
  inputPointer: v.string(),
  parameter: v.string(),
  required: v.optional(v.boolean()),
  style: v.optional(v.literal('form')),
  explode: v.optional(v.boolean()),
})
const executablePathMapping = v.object({
  inputPointer: v.string(),
  parameter: v.string(),
  required: v.optional(v.boolean()),
  style: v.optional(v.literal('simple')),
  explode: v.optional(v.boolean()),
})
const executableHeaderMapping = v.object({
  inputPointer: v.string(),
  parameter: v.string(),
  required: v.optional(v.boolean()),
  style: v.optional(v.literal('simple')),
  explode: v.optional(v.boolean()),
})
const executableFixedQuery = v.object({ parameter: v.string(), value: v.string() })
const serverFunctionAuth = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))),
  issuedAt: v.number(),
  signature: v.string(),
})
const EXECUTABLE_DESCRIPTOR_OPERATION = 'capabilitySupplyOperations:readKeylessExecutable'
const EXECUTABLE_DESCRIPTOR_SCOPE = 'capability_supply:read_executable'
const authorityValue = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({
    kind: v.literal('provider_connection'),
    connectionRef: v.string(),
    providerRef: v.string(),
  }),
)
const executableEffect = v.object({
  class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
  authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
})
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
  price: publicPrice,
  effects: v.array(executableEffect),
  query: v.optional(v.array(executableQueryMapping)),
  path: v.optional(v.array(executablePathMapping)),
  headers: v.optional(v.array(executableHeaderMapping)),
  fixedQuery: v.optional(v.array(executableFixedQuery)),
  requestContentType: v.optional(v.string()),
  responseContentType: v.optional(v.string()),
  responseStatus: v.optional(v.number()),
  requestTimeoutMs: v.number(),
  inputSchemaJson: v.string(),
  outputSchemaJson: v.optional(v.string()),
  provenance: v.object({ publisher: v.string(), sourceKind: v.string() }),
})
const keylessExecutableReturns = v.union(keylessExecutableDescriptor, v.null())
const publishedOperationSnapshotReturns = v.union(
  v.object({ operationJson: v.string() }),
  v.null(),
)
async function serverFunctionAuthorized(
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  operationRef: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (serviceAuth === undefined || key === undefined || key.length < 32
    || !serviceAuth.scopes.includes(EXECUTABLE_DESCRIPTOR_SCOPE)) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: EXECUTABLE_DESCRIPTOR_OPERATION,
    command: { operationRef },
    assertion: serviceAuth,
  })
}


export const readCurrentPublishedOperationSnapshot = internalQueryGeneric({
  args: { operationRef: v.string() },
  returns: publishedOperationSnapshotReturns,
  handler: async (ctx, input) => {
    const operation = await readCurrentPublishedOperation(ctx, input.operationRef, Date.now())
    return operation === undefined ? null : { operationJson: JSON.stringify(operation) }
  },
})
export const readKeylessExecutable = queryGeneric({
  args: { operationRef: v.string(), serviceAuth: v.optional(serverFunctionAuth) },
  returns: keylessExecutableReturns,
  handler: async (ctx, input) => {
    const descriptor = await readKeylessExecutableImpl(ctx, input.operationRef, Date.now())
    if (descriptor === null) return null
    if ((descriptor.fixedQuery?.length ?? 0) > 0
      && !await serverFunctionAuthorized(input.serviceAuth, input.operationRef)) return null
    return descriptor
  },
})


// The answer agent's dynamic-capability tool catalog: every currently
// executable keyless op, exposed eagerly so the model can call an op by its
// own DB-driven strict input schema. Deliberately lean (no endpoint/credential:
// those stay behind the per-invocation readKeylessExecutable reader). Same
// fail-closed gates as the single reader; keyed, x402, or non-http-json operations are omitted.
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
    if (publication.operationRef !== candidateRef) continue

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
    const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
      candidate: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        networkId: publication.networkId,
        businessId: String(business._id),
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef: {
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
      },
      now,
    })
    if (qualification.status !== 'eligible') continue
    const config = parseHttpJsonMessageConfig(binding.configJson)
    if (!isAnonymousKeylessOperationEligible({
      authority: binding.authority,
      adapterId: binding.adapterId,
      method: config?.method ?? '',
      sourceKind: publication.sourceKind,
      price: offering.presentation.price,
      effects: contractResult.contract.effects,
    })) continue
    out.push({
      operationRef: candidateRef,
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
  price: CapabilityOperationSourceRecord['price']
  effects: Array<{
    class: 'data_release' | 'financial_exposure' | 'external_state_change'
    authority: 'none' | 'explicit' | 'mandate_or_explicit'
  }>
  query?: HttpJsonQueryParameterMapping[]
  path?: HttpJsonPathParameterMapping[]
  headers?: HttpJsonHeaderParameterMapping[]
  fixedQuery?: { parameter: string; value: string }[]
  requestContentType?: string
  responseContentType?: string
  responseStatus?: number
  requestTimeoutMs: number
  inputSchemaJson: string
  outputSchemaJson?: string
  provenance: { publisher: string; sourceKind: string }
} | null> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_operationRef_and_disposition', (q) => (
      q.eq('operationRef', operationRef).eq('disposition', 'current')
    ))
    .unique()
  if (publication === null) return null
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
  if (candidateRef !== operationRef) return null
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
  const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId: String(business._id),
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      },
    },
    now,
  })
  if (qualification.status !== 'eligible') return null
  const config = parseHttpJsonMessageConfig(binding.configJson)
  if (config === undefined || !isAnonymousKeylessOperationEligible({
    authority: binding.authority,
    adapterId: binding.adapterId,
    method: config.method,
    sourceKind: publication.sourceKind,
    price: offering.presentation.price,
    effects: contractResult.contract.effects,
  })) return null
  return {
    operationRef,
    capabilityId: publication.capabilityId,
    name: offering.presentation.label,
    summary: contractResult.contract.description,
    searchTerms: [...offering.searchTerms],
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    adapterId: binding.adapterId,
    effects: contractResult.contract.effects.map(({ class: effectClass, authority }) => ({ class: effectClass, authority })),
    method: config.method,
    ...(config.query === undefined || config.query.length === 0 ? {} : { query: [...config.query] }),
    price: offering.presentation.price,
    ...(config.path === undefined || config.path.length === 0 ? {} : { path: [...config.path] }),
    ...(config.headers === undefined || config.headers.length === 0 ? {} : { headers: [...config.headers] }),
    ...(config.fixedQuery === undefined || config.fixedQuery.length === 0 ? {} : { fixedQuery: [...config.fixedQuery] }),
    ...(config.requestContentType === undefined ? {} : { requestContentType: config.requestContentType }),
    ...(config.responseContentType === undefined ? {} : { responseContentType: config.responseContentType }),
    ...(config.responseStatus === undefined ? {} : { responseStatus: config.responseStatus }),
    requestTimeoutMs: config.requestTimeoutMs,
    inputSchemaJson: JSON.stringify(contractResult.contract.inputSchema),
    ...(contractResult.contract.outputSchema === undefined
      ? {}
      : { outputSchemaJson: JSON.stringify(contractResult.contract.outputSchema) }),
    provenance: { publisher: publication.authorityMode, sourceKind: publication.sourceKind },
  }
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
  const list = async (
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
  return {
    listCurrent: async (input) => list(input.networkId, input.limit, input.now),
    loadCurrent: async (operationRef) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_operationRef_and_disposition', (query) => (
          query.eq('operationRef', operationRef).eq('disposition', 'current')
        ))
        .unique()
      if (publication === null) return null
      return await operationRecord(ctx, publication, Date.now()) ?? null
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
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
      .unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
      .unique(),
    ctx.db.get(publication.businessId),
    getExactRegisteredCapabilityContract(ctx.db, {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    }),
  ])
  const operationId = capabilityOperationId(publication.capabilityId)
  const operationRef = createPublicOperationRef({
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
  })
  if (publication.operationRef !== operationRef) return undefined
  if (offeringDoc === null || bindingDoc === null || business === null || contractResult.kind !== 'found') return undefined
  const offering = toCapabilityOfferingRow(offeringDoc)
  const binding = toCapabilityBindingRow(bindingDoc)
  const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId: String(business._id),
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      },
    },
    now,
  })
  if (qualification.reasons.includes('business_not_currently_published')) return undefined
  const integrated = offering.status === 'active'
    && binding.admission === 'admitted'
    && binding.conformance === 'conformant'
  const routeable = qualification.status === 'eligible'
  const unavailableReason = routeable ? undefined : publicUnavailableReason(publication, qualification)
  const authorityMode = publication.authorityMode
  const sourcePrice = offering.presentation.price
  const transport = publicOperationTransportFor(binding.endpointUrl, binding.adapterId, binding.configJson)
  if (transport === undefined) return undefined
  const answerExecutable = isAnonymousKeylessOperationEligible({
    authority: binding.authority,
    adapterId: binding.adapterId,
    method: transport.method,
    sourceKind: publication.sourceKind,
    price: sourcePrice,
    effects: contractResult.contract.effects,
  })
  const pricingSource = qualification.sources.find(({ kind }) => kind === 'pricing')
  const priceEvidence = publication.priceDigest === undefined
    ? undefined
    : {
        priceDigest: publication.priceDigest,
        ...(pricingSource?.ref === undefined ? {} : { sourceRef: pricingSource.ref }),
        evidenceRefs: [...(pricingSource?.evidenceRefs ?? publication.registrationEvidenceRefs)],
      }
  const parameterMappings = publicOperationParameterMappingsFor(binding.adapterId, binding.configJson)
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
    ...(priceEvidence === undefined ? {} : { priceEvidence }),
    materialTerms: offering.presentation.materialTerms.map(({ label, value }) => ({ label, value })),
    commercialRelationship: {
      kind: offering.presentation.commercialRelationship.kind,
      summary: offering.presentation.commercialRelationship.summary,
    },
    cancellation: { kind: binding.cancellation.kind },
    authentication: publicAuthenticationFor(binding.authority, publication.sourceKind, binding.adapterId, binding.configJson),
    transport,
    ...(parameterMappings === undefined ? {} : { parameterMappings }),
    provenance: { publisher: authorityMode, sourceKind: publication.sourceKind },
    integrated,
    routeable,
    answerExecutable,
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: {
      ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
    },
    searchTerms: offering.searchTerms,
    snapshotKey: `publication:${publication.publicationRef}:${publication.revision}`,
  }
}

function publicUnavailableReason(
  publication: Doc<'capabilityPublications'>,
  qualification: Awaited<ReturnType<typeof qualifySuppliedCandidate>>,
): CapabilityOperationSourceRecord['unavailableReason'] {
  if (qualification.reasons.includes('readiness_stale')) return 'readiness_expired'
  if (
    qualification.reasons.includes('readiness_unhealthy')
    || qualification.reasons.includes('credential_access_unavailable')
  ) return 'temporarily_unavailable'
  if (publication.disposition === 'withdrawn') return 'publisher_withdrew'
  if (qualification.reasons.length > 0) return 'setup_required'
  return 'not_supported_by_ae'
}
function publicPathTemplate(endpointUrl: string): string | undefined {
  try {
    const pathname = new URL(endpointUrl).pathname
    if (pathname === '/') return undefined
    return pathname.replace(/%7B/gi, '{').replace(/%7D/gi, '}')
  } catch {
    return undefined
  }
}


function parseTransportConfig(configJson: string): unknown {
  try {
    return JSON.parse(configJson) as unknown
  } catch {
    return undefined
  }
}

function publicOperationTransportFor(
  endpointUrl: string,
  adapterId: string,
  configJson: string,
): PublicOperationTransport | undefined {
  const config = parseTransportConfig(configJson)
  const pathTemplate = publicPathTemplate(endpointUrl)
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    return parsed === undefined ? undefined : {
      method: parsed.method,
      ...(pathTemplate === undefined ? {} : { pathTemplate }),
      ...(parsed.responseStatus === undefined ? {} : { responseStatus: parsed.responseStatus }),
      ...(parsed.responseContentType === undefined ? {} : { responseContentType: parsed.responseContentType }),
      requestTimeoutMs: parsed.requestTimeoutMs,
    }
  }
  if (adapterId === 'x402-fetch:v2') {
    const parsed = parseX402FetchTransportConfiguration(config)
    return parsed === undefined ? undefined : {
      method: parsed.method,
      ...(pathTemplate === undefined ? {} : { pathTemplate }),
      requestTimeoutMs: parsed.requestTimeoutMs,
    }
  }
  if (adapterId === 'mcp-jsonrpc:v1') {
    const parsed = parseMcpJsonRpcTransportConfiguration(config)
    return parsed === undefined ? undefined : { method: 'POST', requestTimeoutMs: parsed.requestTimeoutMs }
  }
  return undefined
}

function publicOperationParameterMappingsFor(
  adapterId: string,
  configJson: string,
): readonly PublicOperationParameterMapping[] | undefined {
  const config = parseTransportConfig(configJson)
  const mappings: PublicOperationParameterMapping[] = []
  if (adapterId === 'http-json:v1') {
    const parsed = parseHttpJsonTransportConfiguration(config)
    if (parsed === undefined) return undefined
    for (const parameter of parsed.path ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'path', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    for (const parameter of parsed.query ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'query', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    for (const parameter of parsed.headers ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'header', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    return mappings.length === 0 ? undefined : mappings
  }
  if (adapterId === 'x402-fetch:v2') {
    const parsed = parseX402FetchTransportConfiguration(config)
    if (parsed === undefined) return undefined
    for (const parameter of parsed.query ?? []) mappings.push({
      inputPointer: parameter.inputPointer, group: 'query', name: parameter.parameter,
      ...(parameter.required === undefined ? {} : { required: parameter.required }),
      ...(parameter.style === undefined ? {} : { style: parameter.style }),
      ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
    })
    return mappings.length === 0 ? undefined : mappings
  }
  return undefined
}

export async function readCurrentPublishedOperation(
  ctx: QueryCtx,
  operationRef: string,
  now = Date.now(),
): Promise<PublishedOperation | undefined> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_operationRef_and_disposition', (query) => (
      query.eq('operationRef', operationRef).eq('disposition', 'current')
    ))
    .unique()
  if (publication === null) return undefined
  const offeringDoc = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
    .unique()
  const bindingDoc = await ctx.db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
    .unique()
  if (offeringDoc === null || bindingDoc === null) return undefined
  const contractResult = await getExactRegisteredCapabilityContract(ctx.db, {
    capabilityId: publication.capabilityId,
    version: publication.version,
    contractDigest: publication.contractDigest,
  })
  if (contractResult.kind !== 'found') return undefined
  const offering = offeringRegistrationFromRow(toCapabilityOfferingRow(offeringDoc))
  let binding
  try {
    const config = JSON.parse(bindingDoc.configJson) as unknown
    binding = defineCapabilityTransportBindingRegistration({
      bindingId: bindingDoc.bindingId,
      offeringId: bindingDoc.offeringId,
      networkId: bindingDoc.networkId,
      contractRef: {
        capabilityId: bindingDoc.capabilityId,
        version: bindingDoc.version,
        contractDigest: bindingDoc.contractDigest,
      },
      endpointUrl: bindingDoc.endpointUrl,
      authority: bindingDoc.authority,
      continuation: bindingDoc.continuation,
      cancellation: bindingDoc.cancellation,
      adapter: { adapterId: bindingDoc.adapterId, config },
      registrationEvidenceRefs: bindingDoc.registrationEvidenceRefs,
    })
  } catch {
    return undefined
  }
  const admittedTransport = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admittedTransport.kind !== 'admitted') return undefined
  const pricing = canonicalPublicationPricing(publication)
  if (pricing === undefined) return undefined
  const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId: publication.businessId,
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      contractRef: {
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
      },
    },
    now,
  })
  if (qualification.status !== 'eligible') return undefined
  try {
    const materialized = materializePublishedOperation({
      publication: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        runtimeEnvironment: publication.runtimeEnvironment,
        sourceDigest: publication.sourceDigest,
        pricingConfig: pricing.config,
        priceDigest: pricing.priceDigest,
        ...(publication.readinessObservedAt === undefined ? {} : { readinessObservedAt: publication.readinessObservedAt }),
        ...(publication.readinessValidUntil === undefined ? {} : { readinessValidUntil: publication.readinessValidUntil }),
        readinessEvidenceRefs: publication.readinessEvidenceRefs,
      },
      contract: contractResult.contract,
      offering,
      binding,
      ...(publication.connectionAuthority === undefined
        ? {}
        : { connectionAuthority: publication.connectionAuthority }),
      admittedTransport: admittedTransport.transport,
      qualification,
    })
    const expectedOperationRef = createPublicOperationRef({
      operationId: capabilityOperationId(contractResult.contract.ref.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: contractResult.contract.ref,
    })
    if (expectedOperationRef === operationRef) return materialized
  } catch {
    return undefined
  }
  return undefined
}


function canonicalPublicationPricing(
  publication: Doc<'capabilityPublications'>,
): Readonly<{ config: PricingConfig; priceDigest: string }> | undefined {
  if (publication.pricingConfigJson === undefined || publication.priceDigest === undefined) return undefined
  try {
    const parsed = normalizePricingConfig(JSON.parse(publication.pricingConfigJson))
    if (parsed.kind !== 'valid' || pricingConfigDigest(parsed.config) !== publication.priceDigest) return undefined
    return { config: parsed.config, priceDigest: publication.priceDigest }
  } catch {
    return undefined
  }
}