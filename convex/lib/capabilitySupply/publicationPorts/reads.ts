import { isPublicToolRef, type PublicationCommandPorts } from '@/modules/capability-supply/public'
import type { MutationCtx } from '../../../_generated/server'
import { eligibleSupplyPorts } from '../../../capabilitySupplyEligiblePorts'

export function publicationReadPorts(ctx: MutationCtx): Pick<PublicationCommandPorts, 'catalogOriginIsCurrent' | 'findContractDigest' | 'loadProviderConnection' | 'loadPublicationAtRevision' | 'loadCurrentPublicationsBySourceRoute'> {
  return {
    catalogOriginIsCurrent: async (origin, businessId) => (
      await eligibleSupplyPorts(ctx.db).catalogOriginIsCurrent(origin, businessId)
    ),
    findContractDigest: async (capabilityId, version) => {
      const existing = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (index) => (
          index.eq('capabilityId', capabilityId).eq('version', version)
        )).unique()
      return existing === null ? null : existing.contractDigest
    },
    loadProviderConnection: async (connectionRef) => (
      await eligibleSupplyPorts(ctx.db).loadProviderConnection(connectionRef) ?? null
    ),
    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) => (
          index.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      if (publication === null) return null
      if (!isPublicToolRef(publication.toolRef)) {
        throw new Error('capability_publication_operation_ref_invalid')
      }
      return {
        id: publication._id,
        toolRef: publication.toolRef,
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        networkId: publication.networkId,
        runtimeEnvironment: publication.runtimeEnvironment,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
        sourceKind: publication.sourceKind,
        ...(publication.sourceSelector === undefined ? {} : { sourceSelector: publication.sourceSelector }),
        ...(publication.sourceDescriptorJson === undefined ? {} : { sourceDescriptorJson: publication.sourceDescriptorJson }),
        sourceRevision: publication.sourceRevision,
        sourceDigest: publication.sourceDigest,
        ...(publication.sourceRouteRef === undefined ? {} : { sourceRouteRef: publication.sourceRouteRef }),
        ...(publication.sourceAuthorityState === undefined ? {} : { sourceAuthorityState: publication.sourceAuthorityState }),
        ...(publication.pricingConfigJson === undefined ? {} : { pricingConfigJson: publication.pricingConfigJson }),
        ...(publication.priceDigest === undefined ? {} : { priceDigest: publication.priceDigest }),
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        provenanceDigest: publication.provenanceDigest,
        ...(publication.connectionAuthority === undefined ? {} : { connectionAuthority: publication.connectionAuthority }),
        ...(publication.supersedesRevision === undefined ? {} : { supersedesRevision: publication.supersedesRevision }),
        disposition: publication.disposition,
        credentialState: publication.credentialState,
        healthState: publication.healthState,
        ...(publication.readinessTargetDigest === undefined ? {} : { readinessTargetDigest: publication.readinessTargetDigest }),
        ...(publication.readinessRequestDigest === undefined ? {} : { readinessRequestDigest: publication.readinessRequestDigest }),
        ...(publication.readinessResponseStatus === undefined ? {} : { readinessResponseStatus: publication.readinessResponseStatus }),
        ...(publication.readinessResponseContentType === undefined ? {} : { readinessResponseContentType: publication.readinessResponseContentType }),
        ...(publication.readinessResponseDigest === undefined ? {} : { readinessResponseDigest: publication.readinessResponseDigest }),
        ...(publication.readinessOutcome === undefined ? {} : { readinessOutcome: publication.readinessOutcome }),
        ...(publication.readinessObservedAt === undefined ? {} : { readinessObservedAt: publication.readinessObservedAt }),
        ...(publication.readinessValidUntil === undefined ? {} : { readinessValidUntil: publication.readinessValidUntil }),
        ...(publication.readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt: publication.readinessLastHealthyAt }),
        readinessEvidenceRefs: publication.readinessEvidenceRefs,
        registrationEvidenceRefs: publication.registrationEvidenceRefs,
      }
    },
    loadCurrentPublicationsBySourceRoute: async (sourceRouteRef) => {
      const publications = await ctx.db.query('capabilityPublications')
        .withIndex('by_sourceRouteRef_and_disposition', (index) => (
          index.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current')
        ))
        .take(16)
      return publications.map((publication) => {
        if (!isPublicToolRef(publication.toolRef)) {
          throw new Error('capability_publication_operation_ref_invalid')
        }
        return {
          id: publication._id,
          toolRef: publication.toolRef,
          publicationRef: publication.publicationRef,
          revision: publication.revision,
          businessId: String(publication.businessId),
          networkId: publication.networkId,
          runtimeEnvironment: publication.runtimeEnvironment,
          offeringId: publication.offeringId,
          bindingId: publication.bindingId,
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
          sourceKind: publication.sourceKind,
          ...(publication.sourceSelector === undefined ? {} : { sourceSelector: publication.sourceSelector }),
          ...(publication.sourceDescriptorJson === undefined ? {} : { sourceDescriptorJson: publication.sourceDescriptorJson }),
          sourceRevision: publication.sourceRevision,
          sourceDigest: publication.sourceDigest,
          ...(publication.sourceRouteRef === undefined ? {} : { sourceRouteRef: publication.sourceRouteRef }),
          ...(publication.sourceAuthorityState === undefined ? {} : { sourceAuthorityState: publication.sourceAuthorityState }),
          ...(publication.pricingConfigJson === undefined ? {} : { pricingConfigJson: publication.pricingConfigJson }),
          ...(publication.priceDigest === undefined ? {} : { priceDigest: publication.priceDigest }),
          publisherRef: publication.publisherRef,
          authorityMode: publication.authorityMode,
          provenanceDigest: publication.provenanceDigest,
          ...(publication.connectionAuthority === undefined ? {} : { connectionAuthority: publication.connectionAuthority }),
          ...(publication.supersedesRevision === undefined ? {} : { supersedesRevision: publication.supersedesRevision }),
          disposition: publication.disposition,
          credentialState: publication.credentialState,
          healthState: publication.healthState,
          ...(publication.readinessOutcome === undefined ? {} : { readinessOutcome: publication.readinessOutcome }),
          ...(publication.readinessObservedAt === undefined ? {} : { readinessObservedAt: publication.readinessObservedAt }),
          ...(publication.readinessValidUntil === undefined ? {} : { readinessValidUntil: publication.readinessValidUntil }),
          ...(publication.readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt: publication.readinessLastHealthyAt }),
          readinessEvidenceRefs: publication.readinessEvidenceRefs,
          registrationEvidenceRefs: publication.registrationEvidenceRefs,
        }
      })
    },
  }
}
