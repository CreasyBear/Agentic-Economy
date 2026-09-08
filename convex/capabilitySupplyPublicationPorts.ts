import {
  isPublicToolRef,
  connectionAuthoritySnapshotsEqual,
  type PublicationCommandPorts,
  type OperationLedgerPorts,
} from '@/modules/capability-supply/public'

import { usesSelectedRequestReadiness } from '@/modules/capability-supply/convex'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  getExactRegisteredCapabilityContract,
  registerCapabilityContractDocument,
} from './capabilityContractDocuments'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { capabilitySupplyToolPorts } from './capabilitySupplyToolPorts'
import { syncMarketToolPresence } from './marketPresence'
export function capabilitySupplyPublicationPorts(
  ctx: MutationCtx,
  writers: Pick<OperationLedgerPorts, 'registerOffering' | 'registerBinding' | 'setEligibility'>,
): PublicationCommandPorts {
  const ledger = capabilitySupplyToolPorts(ctx.db, writers)
  return {
    ...ledger,
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
      if (publication !== null) await syncMarketToolPresence(ctx, {
        toolRef: publication.toolRef,
        businessId: publication.businessId,
        active: false,
        now: updatedAt,
      })
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
