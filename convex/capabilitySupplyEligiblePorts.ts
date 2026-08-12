import {
  capabilityOperationId,
  createPublicOperationRef,
  qualifySuppliedCandidate,
  type EligiblePublicationRow,
  type EligiblePublishedBusiness,
  type EligibleSupplyPorts,
} from '@/modules/capability-supply/public'
import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { normalizePricingConfig, pricingConfigDigest } from '@/modules/money/public'

import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
export function eligibleSupplyPorts(db: QueryCtx['db']): EligibleSupplyPorts {
  return {
    listAdmittedConformantBindingsByNetwork: async (networkId, take) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_networkId_admission_conformance', (query) => (
          query.eq('networkId', networkId).eq('admission', 'admitted').eq('conformance', 'conformant')
        ))
        .take(take)
      return rows.map(toCapabilityBindingRow)
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
        && business.claimStatus === 'published'
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
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', origin.offeringRef)).unique()
      if (offering === null || String(offering.businessId) !== String(businessId)
        || offering.status !== 'published' || offering.currentRevision !== origin.offeringRevision) return false
      const revision = await db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) => (
          query.eq('offeringRef', origin.offeringRef).eq('revision', origin.offeringRevision)
        )).unique()
      if (revision === null || revision.sourceHash !== origin.offeringSourceHash) return false
      if (origin.declaredAccessPathRef === undefined) return true
      const declaredAccessPathRef = origin.declaredAccessPathRef
      const path = await db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', declaredAccessPathRef)).unique()
      return path !== null && path.status === 'published'
        && path.offeringRef === origin.offeringRef
        && path.offeringRevision === origin.offeringRevision
        && path.offeringSourceHash === origin.offeringSourceHash
        && path.sourceHash === origin.accessPathSourceHash
    },
    getActiveExactCapabilityContract: (ref) => getActiveExactCapabilityContract(db, ref),
    qualifySuppliedCandidate: (candidate, now) => qualifySuppliedCandidate(
      capabilitySupplyGraphPorts(db),
      { candidate, now },
    ),
    loadCurrentPublicationByBindingId: async (bindingId) => {
      const publication = await db.query('capabilityPublications')
        .withIndex('by_bindingId_and_disposition', (query) => (
          query.eq('bindingId', bindingId).eq('disposition', 'current')
        )).unique()
      return publication === null ? null : toPublicationRow(publication)
    },
  }
}

function toPublishedBusiness(doc: Doc<'businesses'>): EligiblePublishedBusiness {
  return { businessId: String(doc._id) }
}

function toPublicationRow(doc: Doc<'capabilityPublications'>): EligiblePublicationRow | null {
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(doc.capabilityId),
    publicationRef: doc.publicationRef,
    publicationRevision: doc.revision,
    contractRef: {
      capabilityId: doc.capabilityId,
      version: doc.version,
      contractDigest: doc.contractDigest,
    },
  })
  if (operationRef !== doc.operationRef
    || doc.pricingConfigJson === undefined
    || doc.priceDigest === undefined) return null
  let pricingConfig
  try {
    const parsed = normalizePricingConfig(JSON.parse(doc.pricingConfigJson))
    if (parsed.kind !== 'valid' || pricingConfigDigest(parsed.config) !== doc.priceDigest) return null
    pricingConfig = parsed.config
  } catch {
    return null
  }
  return {
    publicationRef: doc.publicationRef,
    operationRef,
    revision: doc.revision,
    businessId: String(doc.businessId),
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    offeringId: doc.offeringId,
    bindingId: doc.bindingId,
    sourceRevision: doc.sourceRevision,
    sourceDigest: doc.sourceDigest,
    publisherRef: doc.publisherRef,
    provenanceDigest: doc.provenanceDigest,
    registrationEvidenceRefs: [...doc.registrationEvidenceRefs],
    readinessEvidenceRefs: [...doc.readinessEvidenceRefs],
    disposition: doc.disposition,
    credentialState: doc.credentialState,
    healthState: doc.healthState,
    pricingConfig,
    priceDigest: doc.priceDigest,
    ...(doc.connectionAuthority === undefined ? {} : { connectionAuthority: doc.connectionAuthority }),
    ...(doc.readinessValidUntil === undefined ? {} : { readinessValidUntil: doc.readinessValidUntil }),
    ...(doc.readinessObservedAt === undefined ? {} : { readinessObservedAt: doc.readinessObservedAt }),
  }
}
