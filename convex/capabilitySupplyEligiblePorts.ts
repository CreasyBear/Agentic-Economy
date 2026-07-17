import type {
  EligiblePublicationRow,
  EligiblePublishedBusiness,
  EligibleSupplyPorts,
} from '@/modules/capability-supply/internal/eligibility'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'

import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'

export function eligibleSupplyPorts(db: QueryCtx['db']): EligibleSupplyPorts {
  return {
    listAdmittedConformantBindingsByNetwork: async (networkId, take) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_networkId_admission_conformance', (query) => (
          query.eq('networkId', networkId).eq('admission', 'admitted').eq('conformance', 'conformant')
        ))
        .take(take)
      return rows.map(toBindingRow)
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

function toPublicationRow(doc: Doc<'capabilityPublications'>): EligiblePublicationRow {
  return {
    publicationRef: doc.publicationRef,
    revision: doc.revision,
    disposition: doc.disposition,
    credentialState: doc.credentialState,
    healthState: doc.healthState,
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
