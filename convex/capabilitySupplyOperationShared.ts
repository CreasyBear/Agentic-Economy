import { v } from 'convex/values'

import {
  capabilityOperationId,
  createPublicOperationRef,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseAdmittedX402CatalogPayment,
  parseX402FetchTransportConfiguration,
  qualifySuppliedCandidate,
  type CapabilityBindingRow,
  type CapabilityOperationSourceRecord,
  type CatalogOfferingOperationMapEntry,
  type PublicOperationParameterMapping,
  type PublicOperationTransport,
} from '@/modules/capability-supply/public'
import {
  compareExactAmounts,
  normalizePricingConfig,
  pricingConfigDigest,
} from '@/modules/money/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'

export const exactAmount = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
export const publicPrice = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmount }),
  v.object({ kind: v.literal('range'), minimum: exactAmount, maximum: exactAmount }),
  v.object({ kind: v.literal('on_request') }),
)
export const publicPriceBreakdown = v.object({
  providerQuotedAmount: exactAmount,
  agenticEconomyFee: exactAmount,
  totalBuyerAuthorization: exactAmount,
  network: v.literal('eip155:8453'),
  asset: v.literal('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
})
export const publicAuthentication = v.union(
  v.object({ kind: v.literal('ae_api_key') }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('api_key'), in: v.union(v.literal('query'), v.literal('header')), name: v.string() }),
  v.object({ kind: v.literal('platform_credential'), scheme: v.literal('bearer') }),
  v.object({ kind: v.literal('x402') }),
  v.object({ kind: v.literal('unknown') }),
)

export const CURRENT_OPERATION_PROJECTION_DROP_REASONS = [
  'identity_drift',
  'missing_offering',
  'missing_binding',
  'missing_business',
  'missing_contract',
  'business_unpublished',
  'invalid_transport',
  'malformed_price',
] as const

export type CurrentOperationProjectionDropReason = typeof CURRENT_OPERATION_PROJECTION_DROP_REASONS[number]
export type CurrentOperationProjectionResult =
  | Readonly<{ kind: 'projected'; record: CapabilityOperationSourceRecord }>
  | Readonly<{ kind: 'dropped'; reason: CurrentOperationProjectionDropReason }>

export async function operationRecord(
  ctx: Pick<QueryCtx, 'db'>,
  publication: Doc<'capabilityPublications'>,
  now: number,
): Promise<CapabilityOperationSourceRecord | undefined> {
  const projection = await operationRecordProjection(ctx, publication, now)
  return projection.kind === 'projected' ? projection.record : undefined
}
/**
 * Build the current public Operation projection while retaining a bounded,
 * privacy-safe reason when malformed source material has to fail closed.
 * Public readers continue to omit these rows; diagnostics expose counts only.
 */
export async function operationRecordProjection(
  ctx: Pick<QueryCtx, 'db'>,
  publication: Doc<'capabilityPublications'>,
  now: number,
): Promise<CurrentOperationProjectionResult> {
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
  if (publication.operationRef !== operationRef) return { kind: 'dropped', reason: 'identity_drift' }
  if (offeringDoc === null) return { kind: 'dropped', reason: 'missing_offering' }
  if (bindingDoc === null) return { kind: 'dropped', reason: 'missing_binding' }
  if (business === null) return { kind: 'dropped', reason: 'missing_business' }
  if (contractResult.kind !== 'found') return { kind: 'dropped', reason: 'missing_contract' }
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
  if (qualification.reasons.includes('business_not_currently_published')) {
    return { kind: 'dropped', reason: 'business_unpublished' }
  }
  const integrated = offering.status === 'active'
    && binding.admission === 'admitted'
    && binding.conformance === 'conformant'
  const routeable = qualification.status === 'eligible'
  const unavailableReason = routeable ? undefined : publicUnavailableReason(publication, qualification)
  const authorityMode = publication.authorityMode
  const sourcePrice = offering.presentation.price
  const transport = publicOperationTransportFor(binding.endpointUrl, binding.adapterId, binding.configJson)
  if (transport === undefined) return { kind: 'dropped', reason: 'invalid_transport' }
  const pricingSource = qualification.sources.find(({ kind }) => kind === 'pricing')
  const priceBreakdown = priceBreakdownFor(publication, binding.adapterId, binding.configJson, sourcePrice)
  if (priceBreakdown === null) return { kind: 'dropped', reason: 'malformed_price' }
  const priceEvidence = publication.priceDigest === undefined
    ? undefined
    : {
        priceDigest: publication.priceDigest,
        ...(pricingSource?.ref === undefined ? {} : { sourceRef: pricingSource.ref }),
        evidenceRefs: [...(pricingSource?.evidenceRefs ?? publication.registrationEvidenceRefs)],
      }
  const parameterMappings = publicOperationParameterMappingsFor(binding.adapterId, binding.configJson)
  return { kind: 'projected', record: {
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
    ...(priceBreakdown === undefined ? {} : { priceBreakdown }),
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
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: {
      ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
    },
    searchTerms: offering.searchTerms,
    snapshotKey: `publication:${publication.publicationRef}:${publication.revision}`,
  } }
}

const BASE_X402_NETWORK = 'eip155:8453' as const
const BASE_USDC_ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

/**
 * Resolve the optional public split from the pinned publication material. A
 * malformed pinned config is refused; old publications without the material
 * remain readable and simply omit the additive field.
 */
function priceBreakdownFor(
  publication: Doc<'capabilityPublications'>,
  adapterId: string,
  configJson: string,
  displayedPrice: CapabilityOperationSourceRecord['price'],
): CapabilityOperationSourceRecord['priceBreakdown'] | null | undefined {
  const pricingConfigJson = publication.pricingConfigJson
  if (pricingConfigJson === undefined || publication.priceDigest === undefined) return undefined
  let rawConfig: unknown
  try {
    rawConfig = JSON.parse(pricingConfigJson) as unknown
  } catch {
    return null
  }
  const normalized = normalizePricingConfig(rawConfig)
  if (normalized.kind === 'invalid' || pricingConfigDigest(normalized.config) !== publication.priceDigest) return null
  if (displayedPrice.kind !== 'fixed' || compareExactAmounts(normalized.config.paidAmount, displayedPrice.amount) !== 0) return null
  if (normalized.config.providerAmount === undefined || normalized.config.platformFee === undefined) return undefined
  if (publication.sourceKind !== 'x402' || publication.networkId !== BASE_X402_NETWORK) return undefined
  const payment = parseAdmittedX402CatalogPayment(adapterId, configJson)
  if (payment === undefined || payment.network !== BASE_X402_NETWORK || payment.asset.toLowerCase() !== BASE_USDC_ASSET.toLowerCase()) return undefined
  return {
    providerQuotedAmount: normalized.config.providerAmount,
    agenticEconomyFee: normalized.config.platformFee,
    totalBuyerAuthorization: normalized.config.paidAmount,
    network: BASE_X402_NETWORK,
    asset: BASE_USDC_ASSET,
  }
}

export function publicAuthenticationFor(
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
    if (parsed?.credential?.kind === 'none') return authority.kind === 'public_upstream' ? { kind: 'ae_api_key' } : { kind: 'unknown' }
    if (parsed?.credential === undefined && authority.kind === 'public_upstream') return { kind: 'ae_api_key' }
  }
  if (adapterId === 'mcp-jsonrpc:v1') {
    const parsed = parseMcpJsonRpcTransportConfiguration(config)
    if (parsed?.credential?.kind === 'api_key') {
      return { kind: 'platform_credential', scheme: 'api_key', in: parsed.credential.location, name: parsed.credential.name }
    }
    if (parsed?.credential?.kind === 'bearer') return { kind: 'platform_credential', scheme: 'bearer' }
    if (parsed?.credential === undefined && authority.kind === 'public_upstream') return { kind: 'ae_api_key' }
  }
  return { kind: 'unknown' }
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
