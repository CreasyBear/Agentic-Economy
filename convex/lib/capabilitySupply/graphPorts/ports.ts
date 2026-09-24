import type { CapabilityGraphPorts, GraphCatalogAccessPath } from '@/modules/capability-supply/public'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { getActiveExactCapabilityContract, getExactRegisteredCapabilityContract } from '../../../capabilityContractDocuments'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from '../../../capabilitySupplyRowMappers'
import { loadProviderConnection } from './providerConnection'
import { toCatalogAccessPath, toPublicationRow, toPublishedBusiness } from './rows'

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
    loadProviderConnection: (connectionRef) => loadProviderConnection(db, connectionRef),
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
        ...(patch.readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt: patch.readinessLastHealthyAt }),
        readinessEvidenceRefs: [...patch.readinessEvidenceRefs],
        updatedAt: patch.updatedAt,
      })
    },
}
}

