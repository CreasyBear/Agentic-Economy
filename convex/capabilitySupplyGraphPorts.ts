import type {
  CapabilityGraphPorts,
  GraphCatalogAccessPath,
  GraphPublicationRow,
  GraphPublishedBusiness,
} from '@/modules/capability-supply/public'
import type { OfferingAccessPathDescriptor } from '@/modules/catalog/public'
import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { normalizePricingConfig, type PricingConfig } from '@/modules/money/public'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  getActiveExactCapabilityContract,
  getExactRegisteredCapabilityContract,
} from './capabilityContractDocuments'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
export function capabilitySupplyGraphPorts(
  db: QueryCtx['db'] | MutationCtx['db'],
): CapabilityGraphPorts {
  return {
    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      return publication === null ? null : toPublicationRow(publication)
    },
    listCurrentPublicationsByNetwork: async (networkId, take) => {
      const rows = await db.query('capabilityPublications')
        .withIndex('by_networkId_and_disposition', (index) => (
          index.eq('networkId', networkId).eq('disposition', 'current')
        )).take(take)
      return rows.map(toPublicationRow)
    },
    loadOfferingByOfferingId: async (offeringId) => {
      const offering = await db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
      return offering === null ? null : toCapabilityOfferingRow(offering)
    },
    loadBindingByBindingId: async (bindingId) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      return binding === null ? null : toCapabilityBindingRow(binding)
    },
    loadPublishedBusiness: async (businessId) => {
      const business = await db.get(businessId as Id<'businesses'>)
      return business !== null
        && business.publicStatus === 'published'
        && business.suppressedAt === undefined
        ? toPublishedBusiness(business)
        : null
    },
    loadProviderConnection: async (connectionRef): Promise<ProviderConnection | undefined> => {
      const row = await db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
      return row === null ? undefined : {
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
    },
    catalogOriginIsCurrent: async (origin, businessId) => {
      const offering = await db.query('businessOfferings')
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', origin.offeringRef))
        .unique()
      if (
        offering === null
        || String(offering.businessId) !== String(businessId)
        || offering.status !== 'published'
        || offering.currentRevision !== origin.offeringRevision
      ) return false
      const revision = await db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', origin.offeringRef).eq('revision', origin.offeringRevision)
        ))
        .unique()
      if (revision === null || revision.sourceHash !== origin.offeringSourceHash) return false
      const declaredAccessPathRef = origin.declaredAccessPathRef
      if (declaredAccessPathRef === undefined) return true
      const path = await db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', declaredAccessPathRef))
        .unique()
      return path !== null
        && path.status === 'published'
        && path.businessId === offering.businessId
        && path.offeringRef === origin.offeringRef
        && path.offeringRevision === origin.offeringRevision
        && path.offeringSourceHash === origin.offeringSourceHash
        && path.sourceHash === origin.accessPathSourceHash
    },
    loadCatalogAccessPath: async (accessPathRef): Promise<GraphCatalogAccessPath | null> => {
      const path = await db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
        .unique()
      return path === null ? null : toCatalogAccessPath(path)
    },
    getActiveExactCapabilityContract: (ref) => getActiveExactCapabilityContract(db, ref),
    getExactRegisteredCapabilityContract: (ref) => getExactRegisteredCapabilityContract(db, ref),
    patchProbeReadiness: async (publicationId, patch) => {
      if (!('patch' in db)) {
        throw new Error('patchProbeReadiness requires a mutation database writer')
      }
      const connectionAuthority = patch.connectionAuthority === undefined
        ? undefined
        : {
          ...patch.connectionAuthority,
          grantedScopes: [...patch.connectionAuthority.grantedScopes],
          grantedResources: [...patch.connectionAuthority.grantedResources],
        }
      await db.patch(publicationId as Id<'capabilityPublications'>, {
        credentialState: patch.credentialState,
        healthState: patch.healthState,
        ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
        readinessTargetDigest: patch.readinessTargetDigest,
        readinessRequestDigest: patch.readinessRequestDigest,
        ...(patch.readinessResponseStatus === undefined ? {} : { readinessResponseStatus: patch.readinessResponseStatus }),
        ...(patch.readinessResponseContentType === undefined ? {} : { readinessResponseContentType: patch.readinessResponseContentType }),
        ...(patch.readinessResponseDigest === undefined ? {} : { readinessResponseDigest: patch.readinessResponseDigest }),
        readinessOutcome: patch.readinessOutcome,
        readinessObservedAt: patch.readinessObservedAt,
        readinessValidUntil: patch.readinessValidUntil,
        readinessEvidenceRefs: [...patch.readinessEvidenceRefs],
        updatedAt: patch.updatedAt,
      })
    },
}
}

function toPublishedBusiness(doc: Doc<'businesses'>): GraphPublishedBusiness {
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

function toPublicationRow(doc: Doc<'capabilityPublications'>): GraphPublicationRow {
  const pricingConfig = doc.pricingConfigJson === undefined
    ? undefined
    : parsePricingConfig(doc.pricingConfigJson)
  return {
    id: doc._id,
    publicationRef: doc.publicationRef,
    operationRef: doc.operationRef,
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
  }
}

function parsePricingConfig(value: string): PricingConfig | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    const normalized = normalizePricingConfig(parsed)
    return normalized.kind === 'valid' ? normalized.config : undefined
  } catch {
    return undefined
  }
}

