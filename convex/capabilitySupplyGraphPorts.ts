import type {
  CapabilityBindingRow,
  CapabilityGraphPorts,
  CapabilityOfferingRow,
  GraphPublicationRow,
  GraphPublishedBusiness,
} from '@/modules/capability-supply/public'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  getActiveExactCapabilityContract,
  getExactRegisteredCapabilityContract,
} from './capabilityContractDocuments'

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
      return offering === null ? null : toOfferingRow(offering)
    },
    loadBindingByBindingId: async (bindingId) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      return binding === null ? null : toBindingRow(binding)
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
    getActiveExactCapabilityContract: (ref) => getActiveExactCapabilityContract(db, ref),
    getExactRegisteredCapabilityContract: (ref) => getExactRegisteredCapabilityContract(db, ref),
    patchProbeReadiness: async (publicationId, patch) => {
      if (!('patch' in db)) {
        throw new Error('capability_supply_graph_writer_required')
      }
      await db.patch(publicationId as Id<'capabilityPublications'>, {
        credentialState: patch.credentialState,
        healthState: patch.healthState,
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
    claimStatus: 'published',
    suppressed: false,
    currentlyPublished: true,
  }
}

function toPublicationRow(doc: Doc<'capabilityPublications'>): GraphPublicationRow {
  return {
    id: doc._id,
    publicationRef: doc.publicationRef,
    revision: doc.revision,
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
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    readinessEvidenceRefs: doc.readinessEvidenceRefs,
    ...(doc.readinessValidUntil === undefined ? {} : { readinessValidUntil: doc.readinessValidUntil }),
    ...(doc.readinessObservedAt === undefined ? {} : { readinessObservedAt: doc.readinessObservedAt }),
  }
}

function toOfferingRow(doc: Doc<'capabilityOfferings'>): CapabilityOfferingRow {
  return {
    offeringId: doc.offeringId,
    businessId: doc.businessId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    ...(doc.origin === undefined ? {} : { origin: doc.origin }),
    presentation: doc.presentation,
    searchTerms: doc.searchTerms,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    status: doc.status,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}

function toBindingRow(doc: Doc<'capabilityTransportBindings'>): CapabilityBindingRow {
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    bindingId: doc.bindingId,
    offeringId: doc.offeringId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    endpointUrl: doc.endpointUrl,
    credentialRef: doc.credentialRef,
    continuation: doc.continuation,
    cancellation: doc.cancellation,
    adapterId: doc.adapterId,
    configJson: doc.configJson,
    configDigest: doc.configDigest,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    admission: doc.admission,
    conformance: doc.conformance,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    conformanceEvidenceRefs: doc.conformanceEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}
