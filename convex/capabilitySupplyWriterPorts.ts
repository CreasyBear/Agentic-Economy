import type {
  BindingInsertRow,
  OfferingInsertRow,
  EligibilityWritePorts,
  OfferingWritePorts,
  BindingWritePorts,
} from '@/modules/capability-supply/public'

import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'

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
      return offering === null ? null : toCapabilityOfferingRow(offering)
    },
    loadBindingByBindingId: async (bindingId) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      return binding === null ? null : toCapabilityBindingRow(binding)
    },
    listAdmittedConformantBindings: async (offeringId, limit) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
          index.eq('offeringId', offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        )).take(limit)
      return rows.map(toCapabilityBindingRow)
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
        authority: row.authority,
        ...(row.connectionAuthority === undefined ? {} : {
          connectionAuthority: {
            ...row.connectionAuthority,
            grantedScopes: [...row.connectionAuthority.grantedScopes],
            grantedResources: [...row.connectionAuthority.grantedResources],
          },
        }),
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


