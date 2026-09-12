import { v } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  capabilityToolId,
  createPublicToolRef,
  defineCapabilityTransportBindingRegistration,
  offeringRegistrationFromRow,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseAdmittedX402CatalogPayment,
  parseX402FetchTransportConfiguration,
  qualifySuppliedCandidate,
  type CapabilityBindingRow,
  type CapabilityToolSourceRecord,
  type CatalogOfferingToolMapEntry,
  type PublicToolParameterMapping,
  type PublicToolTransport,
} from '@/modules/capability-supply/public'
import {
  compareExactAmounts,
  displayPriceFromPricingConfig,
  normalizePricingConfig,
  pricingConfigDecisionAmount,
  pricingConfigSourceAmount,
  pricingConfigDigest,
} from '@/modules/money/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { readManagedX402InspectionTargetForQualifiedCandidate } from './capabilitySupplyCurrentTool'
import { toolProviderRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
import { directoryListingEntry } from './capabilitySupplyDirectoryEligibility'

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
export const publicPayment = v.object({
  protocol: v.literal('x402'),
  scheme: v.literal('exact'),
  network: v.string(),
  asset: v.string(),
  currency: v.string(),
})

export const CURRENT_TOOL_PROJECTION_DROP_REASONS = [
  'identity_drift',
  'missing_offering',
  'missing_binding',
  'missing_business',
  'missing_contract',
  'business_unpublished',
  'invalid_transport',
  'malformed_offering',
  'malformed_binding',
  'malformed_price',
  'directory_ineligible',
] as const

export type CurrentToolProjectionDropReason = typeof CURRENT_TOOL_PROJECTION_DROP_REASONS[number]
export type CurrentToolProjectionResult =
  | Readonly<{ kind: 'projected'; record: CapabilityToolSourceRecord }>
  | Readonly<{ kind: 'dropped'; reason: CurrentToolProjectionDropReason }>

export async function toolRecord(
  ctx: Pick<QueryCtx, 'db'>,
  publication: Doc<'capabilityPublications'>,
  now: number,
): Promise<CapabilityToolSourceRecord | undefined> {
  const projection = await toolRecordProjection(ctx, publication, now)
  return projection.kind === 'projected' ? projection.record : undefined
}
/**
 * Build the current public Tool projection while retaining a bounded,
 * privacy-safe reason when malformed source material has to fail closed.
 * Public readers continue to omit these rows; diagnostics expose counts only.
 */
export async function toolRecordProjection(
  ctx: Pick<QueryCtx, 'db'>,
  publication: Doc<'capabilityPublications'>,
  now: number,
): Promise<CurrentToolProjectionResult> {
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
  const operationId = capabilityToolId(publication.capabilityId)
  const toolRef = createPublicToolRef({
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
  })
  if (publication.toolRef !== toolRef) return { kind: 'dropped', reason: 'identity_drift' }
  if (offeringDoc === null) return { kind: 'dropped', reason: 'missing_offering' }
  if (bindingDoc === null) return { kind: 'dropped', reason: 'missing_binding' }
  if (business === null) return { kind: 'dropped', reason: 'missing_business' }
  if (contractResult.kind !== 'found') return { kind: 'dropped', reason: 'missing_contract' }
  const directoryEntry = await directoryListingEntry(ctx, publication.authorityMode, publication.sourceRouteRef)
  if (!directoryEntry.eligible) {
    return { kind: 'dropped', reason: 'directory_ineligible' }
  }
  // Human-legible canonical page (`/tools/<providerHost>/<slug>`), same
  // fields `x402DirectoryIndex.ts:canonicalUrlForTool` reverse-looks-up
  // separately for the `/tools/$toolRef` redirect - reusing the eligibility
  // join's row here instead of re-querying. Undefined when the publication
  // never joined a directory row (Provider-owned Tools have no directory
  // row today and so get no canonical URL yet; they need a slug source of
  // their own as a follow-up) or the row predates the slug backfill.
  const canonical = directoryEntry.row?.providerKey === undefined || directoryEntry.row.slug === undefined
    ? undefined
    : {
        providerHost: directoryEntry.row.providerKey,
        slug: directoryEntry.row.slug,
        path: `/tools/${directoryEntry.row.providerKey}/${directoryEntry.row.slug}`,
      }
  let offering
  let binding
  try {
    offering = offeringRegistrationFromRow(toCapabilityOfferingRow(offeringDoc))
  } catch (cause) {
    return degradeBackend(cause, { kind: 'dropped', reason: 'malformed_offering' } as const, { site: 'toolRecordProjection', reason: 'invalid_response' })
  }
  const bindingRow = toCapabilityBindingRow(bindingDoc)
  try {
    binding = defineCapabilityTransportBindingRegistration({
      bindingId: bindingRow.bindingId,
      offeringId: bindingRow.offeringId,
      networkId: bindingRow.networkId,
      contractRef: {
        capabilityId: bindingRow.capabilityId,
        version: bindingRow.version,
        contractDigest: bindingRow.contractDigest,
      },
      endpointUrl: bindingRow.endpointUrl,
      authority: bindingRow.authority,
      continuation: bindingRow.continuation,
      cancellation: bindingRow.cancellation,
      adapter: { adapterId: bindingRow.adapterId, config: JSON.parse(bindingRow.configJson) as unknown },
      registrationEvidenceRefs: bindingRow.registrationEvidenceRefs,
    })
  } catch (cause) {
    return degradeBackend(cause, { kind: 'dropped', reason: 'malformed_binding' } as const, { site: 'toolRecordProjection', reason: 'invalid_response' })
  }
  const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId: String(business._id),
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: binding.contractRef,
    },
    now,
  })
  if (qualification.reasons.includes('business_not_currently_published')) {
    return { kind: 'dropped', reason: 'business_unpublished' }
  }
  const integrated = offeringDoc.status === 'active'
    && bindingRow.admission === 'admitted'
    && bindingRow.conformance === 'conformant'
  const routeable = qualification.status === 'eligible'
  // Reuse this row's already-fetched binding/contract docs and the
  // qualification just computed above instead of calling the standalone
  // `readManagedX402InspectionTarget(ctx, toolRef, now)` - it would re-fetch
  // the same publication, re-run `qualifySuppliedCandidate` (publication +
  // business + contract + offering + binding reads) and re-fetch the
  // binding/contract a second time for every row of every catalogue page.
  const awaitingInspection = !routeable && binding.adapter.adapterId === 'x402-fetch:v2'
    && !(await toolProviderRouteabilityIsFrozen(ctx, publication.toolRef))
    && await readManagedX402InspectionTargetForQualifiedCandidate(ctx, {
      publication, binding: bindingDoc, contract: contractResult, qualification,
    }) !== undefined
  const unavailableReason = routeable ? undefined : awaitingInspection ? 'inspection_required' as const : publicUnavailableReason(publication, qualification)
  const authorityMode = publication.authorityMode
  // Display price is derived from the publication's pinned pricing config
  // rather than read off the stored offering (`presentation.price` is being
  // retired as a stored field); `priceBreakdownFor` below re-derives and
  // digest-checks the same config for the x402/on_request breakdown.
  let normalizedPricingConfig: ReturnType<typeof normalizePricingConfig> | undefined
  try {
    normalizedPricingConfig = publication.pricingConfigJson === undefined
      ? undefined
      : normalizePricingConfig(JSON.parse(publication.pricingConfigJson) as unknown)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'dropped', reason: 'malformed_price' } as const, { site: 'toolRecordProjection', reason: 'invalid_response' })
  }
  if (
    normalizedPricingConfig === undefined
    || normalizedPricingConfig.kind === 'invalid'
    || publication.priceDigest === undefined
    || pricingConfigDigest(normalizedPricingConfig.config) !== publication.priceDigest
  ) return { kind: 'dropped', reason: 'malformed_price' }
  const sourcePrice = displayPriceFromPricingConfig(normalizedPricingConfig.config)
  const transport = publicToolTransportFor(binding.endpointUrl, binding.adapter.adapterId, bindingRow.configJson)
  if (transport === undefined) return { kind: 'dropped', reason: 'invalid_transport' }
  const pricingSource = qualification.sources.find(({ kind }) => kind === 'pricing')
  const priceBreakdown = priceBreakdownFor(publication, binding.adapter.adapterId, bindingRow.configJson, sourcePrice)
  if (priceBreakdown === null) return { kind: 'dropped', reason: 'malformed_price' }
  const priceEvidence = publication.priceDigest === undefined
    ? undefined
    : {
        priceDigest: publication.priceDigest,
        ...(pricingSource?.ref === undefined ? {} : { sourceRef: pricingSource.ref }),
        evidenceRefs: [...(pricingSource?.evidenceRefs ?? publication.registrationEvidenceRefs)],
      }
  const parameterMappings = publicToolParameterMappingsFor(binding.adapter.adapterId, bindingRow.configJson)
  const payment = bindingRow.admission === 'admitted' && bindingRow.conformance === 'conformant'
    ? parseAdmittedX402CatalogPayment(binding.adapter.adapterId, bindingRow.configJson)
    : undefined
  return { kind: 'projected', record: {
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    networkId: publication.networkId,
    contract: contractResult.contract,
    business: { businessId: String(business._id), slug: business.slug, name: business.name },
    listing: {
      listingRef: offering.origin?.kind === 'catalog_offering' ? offering.origin.offeringRef : offering.offeringId,
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
    authentication: publicAuthenticationFor(binding.authority, publication.sourceKind, binding.adapter.adapterId, bindingRow.configJson),
    ...(payment === undefined ? {} : {
      payment: {
        protocol: 'x402',
        scheme: 'exact',
        network: payment.network,
        asset: payment.asset,
        currency: payment.currency,
      },
    }),
    transport,
    ...(parameterMappings === undefined ? {} : { parameterMappings }),
    provenance: { publisher: authorityMode, sourceKind: publication.sourceKind },
    integrated,
    routeable,
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
    readiness: {
      ...(publication.readinessObservedAt === undefined ? {} : { observedAt: publication.readinessObservedAt }),
      ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
      ...(publication.readinessLastHealthyAt === undefined ? {} : { lastHealthyAt: publication.readinessLastHealthyAt }),
    },
    searchTerms: offering.searchTerms,
    snapshotKey: `publication:${publication.publicationRef}:${publication.revision}`,
    ...(canonical === undefined ? {} : { canonical }),
  } }
}

/**
 * Resolve the optional public split from the pinned publication material. A
 * malformed pinned config is refused; old publications without the material
 * remain readable and simply omit the additive field.
 */
function priceBreakdownFor(
  publication: Doc<'capabilityPublications'>,
  adapterId: string,
  configJson: string,
  displayedPrice: CapabilityToolSourceRecord['price'],
): CapabilityToolSourceRecord['priceBreakdown'] | null | undefined {
  const pricingConfigJson = publication.pricingConfigJson
  if (pricingConfigJson === undefined || publication.priceDigest === undefined) return undefined
  let rawConfig: unknown
  try {
    rawConfig = JSON.parse(pricingConfigJson) as unknown
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'priceBreakdownFor', reason: 'invalid_response' })
  }
  const normalized = normalizePricingConfig(rawConfig)
  if (normalized.kind === 'invalid' || pricingConfigDigest(normalized.config) !== publication.priceDigest) return null
  const decisionAmount = pricingConfigDecisionAmount(normalized.config)
  if (normalized.config.kind === 'fixed_aud') {
    return displayedPrice.kind === 'fixed'
      && decisionAmount !== undefined
      && compareExactAmounts(decisionAmount, displayedPrice.amount) === 0
      ? undefined
      : null
  }
  if (displayedPrice.kind !== 'on_request') return null
  if (publication.sourceKind !== 'x402') return null
  const payment = parseAdmittedX402CatalogPayment(adapterId, configJson)
  const sourceAmount = pricingConfigSourceAmount(normalized.config)
  return payment !== undefined
    && payment.network === normalized.config.sourceRequirement.network
    && payment.asset.toLowerCase() === normalized.config.sourceRequirement.asset.toLowerCase()
    && sourceAmount.units === normalized.config.sourceRequirement.atomicUnits
    ? undefined
    : null
}

export function publicAuthenticationFor(
  authority: CapabilityBindingRow['authority'],
  sourceKind: CatalogOfferingToolMapEntry['sourceKind'],
  adapterId: string,
  configJson: string,
): CatalogOfferingToolMapEntry['authentication'] {
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
): CapabilityToolSourceRecord['unavailableReason'] {
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'publicPathTemplate', reason: 'invalid_response' })
  }
}

function parseTransportConfig(configJson: string): unknown {
  try {
    return JSON.parse(configJson) as unknown
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parseTransportConfig', reason: 'invalid_response' })
  }
}

function publicToolTransportFor(
  endpointUrl: string,
  adapterId: string,
  configJson: string,
): PublicToolTransport | undefined {
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

function publicToolParameterMappingsFor(
  adapterId: string,
  configJson: string,
): readonly PublicToolParameterMapping[] | undefined {
  const config = parseTransportConfig(configJson)
  const mappings: PublicToolParameterMapping[] = []
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
