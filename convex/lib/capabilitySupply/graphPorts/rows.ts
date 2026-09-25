import type { GraphCatalogAccessPath, GraphPublicationRow, GraphPublishedBusiness } from '@/modules/capability-supply/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { OfferingAccessPathDescriptor } from '@/modules/catalog/public'
import { normalizePricingConfig, type PricingConfig } from '@/modules/money/public'
import type { Doc } from '../../../_generated/dataModel'

export function toPublishedBusiness(doc: Doc<'businesses'>): GraphPublishedBusiness {
  return {
    businessId: String(doc._id),
    trustTier: doc.trustTier,
    publicStatus: 'published',
    suppressed: false,
    currentlyPublished: true,
  }
}

export function toCatalogAccessPath(doc: Doc<'offeringAccessPaths'>): GraphCatalogAccessPath {
  return {
    accessPathRef: doc.accessPathRef,
    businessId: String(doc.businessId),
    offeringRef: doc.offeringRef,
    offeringRevision: doc.offeringRevision,
    offeringSourceHash: doc.offeringSourceHash,
    status: doc.status,
    sourceHash: doc.sourceHash,
    descriptor: toAccessPathDescriptor(doc.descriptor),
  }
}

function toAccessPathDescriptor(
  value: Doc<'offeringAccessPaths'>['descriptor'],
): OfferingAccessPathDescriptor {
  if (value.kind === 'human_request') {
    const channel = value.channel
    if (channel !== 'phone' && channel !== 'website') {
      throw new Error('offering_access_path_descriptor_invalid')
    }
    return {
      kind: 'human_request',
      channel,
      disclosure: value.disclosure,
      ...(value.url === undefined ? {} : { url: value.url }),
    }
  }
  const provenance = value.provenance
  if (provenance !== 'business_declared' && provenance !== 'publicly_observed') {
    throw new Error('offering_access_path_descriptor_invalid')
  }
  return {
    kind: 'external_operation',
    name: value.name,
    summary: value.summary,
    url: value.url,
    ...(value.method === undefined ? {} : { method: value.method }),
    ...(value.documentationUrl === undefined ? {} : { documentationUrl: value.documentationUrl }),
    ...(value.interfaceDescription === undefined ? {} : {
      interfaceDescription: {
        format: value.interfaceDescription.format,
        ...(value.interfaceDescription.url === undefined ? {} : { url: value.interfaceDescription.url }),
      },
    }),
    ...(value.authenticationSummary === undefined ? {} : { authenticationSummary: value.authenticationSummary }),
    ...(value.pricingSummary === undefined ? {} : { pricingSummary: value.pricingSummary }),
    provenance,
  }
}

export function toPublicationRow(doc: Doc<'capabilityPublications'>): GraphPublicationRow {
  const pricingConfig = doc.pricingConfigJson === undefined
    ? undefined
    : parsePricingConfig(doc.pricingConfigJson)
  return {
    id: doc._id,
    publicationRef: doc.publicationRef,
    toolRef: doc.toolRef,
    revision: doc.revision,
    networkId: doc.networkId,
    businessId: doc.businessId,
    offeringId: doc.offeringId,
    bindingId: doc.bindingId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    sourceKind: doc.sourceKind,
    sourceDigest: doc.sourceDigest,
    publisherRef: doc.publisherRef,
    authorityMode: doc.authorityMode,
    ...(doc.sourceAuthorityState === undefined ? {} : { sourceAuthorityState: doc.sourceAuthorityState }),
    disposition: doc.disposition,
    credentialState: doc.credentialState,
    healthState: doc.healthState,
    ...(doc.connectionAuthority === undefined ? {} : { connectionAuthority: doc.connectionAuthority }),
    ...(pricingConfig === undefined ? {} : { pricingConfig }),
    ...(doc.priceDigest === undefined ? {} : { priceDigest: doc.priceDigest }),
    ...(doc.readinessTargetDigest === undefined ? {} : { readinessTargetDigest: doc.readinessTargetDigest }),
    ...(doc.readinessRequestDigest === undefined ? {} : { readinessRequestDigest: doc.readinessRequestDigest }),
    ...(doc.readinessResponseStatus === undefined ? {} : { readinessResponseStatus: doc.readinessResponseStatus }),
    ...(doc.readinessResponseContentType === undefined ? {} : { readinessResponseContentType: doc.readinessResponseContentType }),
    ...(doc.readinessResponseDigest === undefined ? {} : { readinessResponseDigest: doc.readinessResponseDigest }),
    ...(doc.readinessOutcome === undefined ? {} : { readinessOutcome: doc.readinessOutcome }),
    readinessEvidenceRefs: doc.readinessEvidenceRefs,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    ...(doc.readinessValidUntil === undefined ? {} : { readinessValidUntil: doc.readinessValidUntil }),
    ...(doc.readinessObservedAt === undefined ? {} : { readinessObservedAt: doc.readinessObservedAt }),
    ...(doc.readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt: doc.readinessLastHealthyAt }),
  }
}

function parsePricingConfig(value: string): PricingConfig | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    const normalized = normalizePricingConfig(parsed)
    return normalized.kind === 'valid' ? normalized.config : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'parsePricingConfig', reason: 'invalid_response' })
  }
}
