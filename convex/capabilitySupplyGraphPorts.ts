import type {
  CapabilityGraphPorts,
  GraphPublicationRow,
  GraphPublishedBusiness,
} from '@/modules/capability-supply/public'
import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'

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
    operationRef: doc.operationRef,
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
    ...(doc.connectionAuthority === undefined ? {} : { connectionAuthority: doc.connectionAuthority }),
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    readinessEvidenceRefs: doc.readinessEvidenceRefs,
    ...(doc.readinessValidUntil === undefined ? {} : { readinessValidUntil: doc.readinessValidUntil }),
    ...(doc.readinessObservedAt === undefined ? {} : { readinessObservedAt: doc.readinessObservedAt }),
  }
}


