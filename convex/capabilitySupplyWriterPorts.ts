import type {
  BindingInsertRow,
  BindingWritePorts,
  CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import type { EligibilityWritePorts } from '@/modules/capability-supply/internal/eligibility'
import type {
  CapabilityOfferingRow,
  OfferingInsertRow,
  OfferingWritePorts,
} from '@/modules/capability-supply/internal/offering'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'

export type CapabilitySupplyWriterPorts =
  OfferingWritePorts & BindingWritePorts & EligibilityWritePorts

export function capabilitySupplyWriterPorts(
  db: MutationCtx['db'],
): CapabilitySupplyWriterPorts {
  return {
    loadPublishedBusiness: async (businessId) => {
      const business = await db.get(businessId as Id<'businesses'>)
      return business !== null
        && business.publicStatus === 'published'
        && business.claimStatus === 'published'
        && business.suppressedAt === undefined
        ? { businessId: String(business._id) }
        : null
    },
    resolveExactContract: async (ref) => {
      const result = await getActiveExactCapabilityContract(db, ref)
      if (result.kind === 'found') return { kind: 'found' as const }
      return {
        kind: 'refused' as const,
        reason: result.reason === 'not_found'
          ? 'contract_not_found' as const
          : result.reason === 'not_active'
            ? 'contract_not_active' as const
            : 'contract_integrity_failure' as const,
      }
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
    listAdmittedConformantBindings: async (offeringId, limit) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
          index.eq('offeringId', offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        )).take(limit)
      return rows.map(toBindingRow)
    },
    insertOffering: async (row: OfferingInsertRow) => {
      await db.insert('capabilityOfferings', {
        offeringId: row.offeringId,
        businessId: row.businessId as Id<'businesses'>,
        networkId: row.networkId,
        capabilityId: row.capabilityId,
        version: row.version,
        contractDigest: row.contractDigest,
        ...(row.origin === undefined ? {} : {
          origin: row.origin.kind === 'standalone'
            ? { kind: 'standalone' as const }
            : {
                kind: 'catalog_offering' as const,
                offeringRef: row.origin.offeringRef,
                offeringRevision: row.origin.offeringRevision,
                offeringSourceHash: row.origin.offeringSourceHash,
                ...(row.origin.declaredAccessPathRef === undefined
                  ? {}
                  : { declaredAccessPathRef: row.origin.declaredAccessPathRef }),
                ...(row.origin.accessPathSourceHash === undefined
                  ? {}
                  : { accessPathSourceHash: row.origin.accessPathSourceHash }),
              },
        }),
        presentation: row.presentation,
        searchTerms: [...row.searchTerms],
        registrationEvidenceRefs: [...row.registrationEvidenceRefs],
        registrationHash: row.registrationHash,
        status: row.status,
        admissionEvidenceRefs: [...row.admissionEvidenceRefs],
        eligibilityHash: row.eligibilityHash,
        registeredAt: row.registeredAt,
        updatedAt: row.updatedAt,
      })
    },
    insertBinding: async (row: BindingInsertRow) => {
      await db.insert('capabilityTransportBindings', {
        bindingId: row.bindingId,
        offeringId: row.offeringId,
        networkId: row.networkId,
        capabilityId: row.capabilityId,
        version: row.version,
        contractDigest: row.contractDigest,
        endpointUrl: row.endpointUrl,
        credentialRef: row.credentialRef,
        continuation: {
          ...row.continuation,
          evidenceRefs: [...row.continuation.evidenceRefs],
        },
        cancellation: {
          ...row.cancellation,
          evidenceRefs: [...row.cancellation.evidenceRefs],
        },
        adapterId: row.adapterId,
        configJson: row.configJson,
        configDigest: row.configDigest,
        registrationEvidenceRefs: [...row.registrationEvidenceRefs],
        registrationHash: row.registrationHash,
        admission: row.admission,
        conformance: row.conformance,
        admissionEvidenceRefs: [...row.admissionEvidenceRefs],
        conformanceEvidenceRefs: [...row.conformanceEvidenceRefs],
        eligibilityHash: row.eligibilityHash,
        registeredAt: row.registeredAt,
        updatedAt: row.updatedAt,
      })
    },
    patchOfferingEligibility: async (offeringId, patch) => {
      const offering = await db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
      if (offering === null) throw new Error('capability_supply_writer_integrity_failure')
      await db.patch(offering._id, {
        status: patch.status,
        admissionEvidenceRefs: [...patch.admissionEvidenceRefs],
        eligibilityHash: patch.eligibilityHash,
        updatedAt: patch.updatedAt,
      })
    },
    patchBindingEligibility: async (bindingId, patch) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      if (binding === null) throw new Error('capability_supply_writer_integrity_failure')
      await db.patch(binding._id, {
        admission: patch.admission,
        conformance: patch.conformance,
        admissionEvidenceRefs: [...patch.admissionEvidenceRefs],
        conformanceEvidenceRefs: [...patch.conformanceEvidenceRefs],
        eligibilityHash: patch.eligibilityHash,
        updatedAt: patch.updatedAt,
      })
    },
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
