import { connectionAuthoritySnapshotsEqual, type PublicationCommandPorts } from '@/modules/capability-supply/public'
import { usesSelectedRequestReadiness } from '@/modules/capability-supply/convex'
import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { getExactRegisteredCapabilityContract } from '../../capabilityContract/documents/reads'
import { registerCapabilityContractDocument } from '../../capabilityContract/documents/registration'
import { rebuildCapabilityOriginSupplyProjection } from '../projection/rebuild'
import { syncMarketToolPresence } from '../../../marketPresence'

export function publicationWritePorts(ctx: MutationCtx): Pick<PublicationCommandPorts, 'insertPublication' | 'patchPublicationSuperseded' | 'patchPublicationWithdrawn' | 'registerContractDocument' | 'getExactRegisteredContract' | 'scheduleReadinessProbe'> {
  return {
    insertPublication: async (input) => {
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique()
      if (binding === null) throw new Error('capability_publication_binding_missing')
      if (input.connectionAuthority !== undefined
        && !connectionAuthoritySnapshotsEqual(input.connectionAuthority, binding.connectionAuthority)) {
        throw new Error('capability_publication_authority_snapshot_invalid')
      }
      if (binding.sourceRouteRef !== undefined && binding.sourceRouteRef !== input.sourceRouteRef) {
        throw new Error('capability_publication_source_route_conflict')
      }
      if (binding.sourceRouteRef === undefined) {
        await ctx.db.patch(binding._id, { sourceRouteRef: input.sourceRouteRef })
      }
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', input.offeringId)).unique()
      const business = await ctx.db.get(input.businessId as Id<'businesses'>)
      await ctx.db.insert('capabilityPublications', {
        searchText: [input.capabilityId, offering?.presentation.label, offering?.presentation.summary, ...(offering?.searchTerms ?? []), business?.name].filter(Boolean).join(' '),
        toolRef: input.toolRef,
        publicationRef: input.publicationRef,
        revision: input.revision,
        businessId: input.businessId as Id<'businesses'>,
        networkId: input.networkId,
        runtimeEnvironment: input.runtimeEnvironment,
        sourceSelector: input.sourceSelector,
        sourceDescriptorJson: input.sourceDescriptorJson,
        pricingConfigJson: input.pricingConfigJson,
        priceDigest: input.priceDigest,
        sourceKind: input.sourceKind,
        sourceRevision: input.sourceRevision,
        sourceDigest: input.sourceDigest,
        ...(input.sourceRouteRef === undefined ? {} : { sourceRouteRef: input.sourceRouteRef }),
        ...(input.sourceAuthorityState === undefined ? {} : { sourceAuthorityState: input.sourceAuthorityState }),
        publisherRef: input.publisherRef,
        authorityMode: input.authorityMode,
        provenanceDigest: input.provenanceDigest,
        capabilityId: input.capabilityId,
        version: input.version,
        contractDigest: input.contractDigest,
        offeringId: input.offeringId,
        bindingId: input.bindingId,
        disposition: input.disposition,
        ...(binding.connectionAuthority === undefined
          ? {}
          : { connectionAuthority: binding.connectionAuthority }),
        ...(input.supersedesRevision === undefined ? {} : { supersedesRevision: input.supersedesRevision }),
        credentialState: 'unobserved',
        healthState: 'unobserved',
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: [...input.registrationEvidenceRefs],
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
    },
    patchPublicationSuperseded: async (publicationId, updatedAt) => {
      const id = publicationId as Id<'capabilityPublications'>
      const publication = await ctx.db.get(id)
      await ctx.db.patch(id, {
        disposition: 'superseded',
        updatedAt,
      })
      if (publication !== null) await syncMarketToolPresence(ctx, {
        toolRef: publication.toolRef,
        businessId: publication.businessId,
        active: false,
        now: updatedAt,
      })
    },
    patchPublicationWithdrawn: async (publicationId, updatedAt) => {
      const id = publicationId as Id<'capabilityPublications'>
      const publication = await ctx.db.get(id)
      await ctx.db.patch(id, {
        disposition: 'withdrawn',
        withdrawnAt: updatedAt,
        updatedAt,
      })
      if (publication !== null) {
        await syncMarketToolPresence(ctx, {
          toolRef: publication.toolRef,
          businessId: publication.businessId,
          active: false,
          now: updatedAt,
        })
        // registrySearchDocuments mirrors capabilityPublications' disposition;
        // rebuild it in the same mutation as the withdraw patch so a
        // withdrawn publication cannot stay searchable until the hourly
        // sweep (rebuildAllBusinessSupplyProjections) catches up.
        await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId, updatedAt)
      }
    },
    registerContractDocument: (documentJson, now) => (
      registerCapabilityContractDocument(ctx.db, documentJson, now)
    ),
    getExactRegisteredContract: (ref) => getExactRegisteredCapabilityContract(ctx.db, ref),
    scheduleReadinessProbe: async (publicationRef, expectedRevision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', q => q.eq('publicationRef', publicationRef).eq('revision', expectedRevision)).unique()
      if (publication !== null && usesSelectedRequestReadiness(publication)) return
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
        publicationRef,
        expectedRevision,
      })
    },
  }
}
