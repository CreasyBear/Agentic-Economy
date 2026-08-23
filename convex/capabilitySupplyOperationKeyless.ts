import { v } from 'convex/values'

import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  isAnonymousKeylessOperationEligible,
  capabilityOperationId,
  createPublicOperationRef,
  parseAdmittedTransportCatalogMetadata,
  parseAdmittedX402CatalogPayment,
  parseHttpJsonTransportConfiguration,
  projectCapabilityOperation,
  qualifySuppliedCandidate,
  MAX_ELIGIBLE_SUPPLY,
  admitRegisteredTransport,
  defineCapabilityTransportBindingRegistration,
  materializePublishedOperation,
  type PublishedOperation,
  type CapabilityBindingRow,
  type CapabilityOperationSourceRecord,
  type CatalogOfferingOperationMapEntry,
  type HttpJsonHeaderParameterMapping,
  type HttpJsonPathParameterMapping,
  type HttpJsonQueryParameterMapping,
  type HttpJsonTransportConfiguration,
  offeringRegistrationFromRow,
} from '@/modules/capability-supply/public'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import type { Doc, Id } from './_generated/dataModel'
import { env, type QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import {
  operationRecord,
  publicAuthentication,
  publicAuthenticationFor,
  publicPrice,
} from './capabilitySupplyOperationShared'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'

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
export const offeringOperationMapReturns = v.array(v.object({
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

export async function offeringOperationMapHandler(
  ctx: QueryCtx,
  args: { businessIds: string[] },
) {
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
}

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
export const serverFunctionAuth = v.object({
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
export const keylessExecutableReturns = v.union(keylessExecutableDescriptor, v.null())
export const publishedOperationSnapshotReturns = v.union(
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

export async function readCurrentPublishedOperationSnapshotHandler(
  ctx: QueryCtx,
  input: { operationRef: string },
) {
  const operation = await readCurrentPublishedOperation(ctx, input.operationRef, Date.now())
  return operation === undefined ? null : { operationJson: JSON.stringify(operation) }
}

export async function readKeylessExecutableHandler(
  ctx: QueryCtx,
  input: {
    operationRef: string
    serviceAuth?: CustomerRequestServiceAssertion & {
      authorityMode?: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
      scopes: string[]
    }
  },
) {
  const descriptor = await readKeylessExecutableImpl(ctx, input.operationRef, Date.now())
  if (descriptor === null) return null
  if ((descriptor.fixedQuery?.length ?? 0) > 0
    && !await serverFunctionAuthorized(input.serviceAuth, input.operationRef)) return null
  return descriptor
}

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
export const keylessExecutableListReturns = v.array(keylessExecutableListing)

export async function listKeylessExecutableHandler(ctx: QueryCtx) {
  return listKeylessExecutableImpl(ctx, Date.now())
}

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
  const [offeringDoc, bindingDoc] = await Promise.all([
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
      .unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
      .unique(),
  ])
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
