import { isPublicOperationRef, type PublicationCommandPorts, type OperationLedgerPorts } from '@/modules/capability-supply/public'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  getExactRegisteredCapabilityContract,
  registerCapabilityContractDocument,
} from './capabilityContractDocuments'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'

export function capabilitySupplyPublicationPorts(
  ctx: MutationCtx,
  writers: Pick<OperationLedgerPorts, 'registerOffering' | 'registerBinding' | 'setEligibility'>,
): PublicationCommandPorts {
  const ledger = capabilitySupplyOperationPorts(ctx.db, writers)
  return {
    ...ledger,
    findContractDigest: async (capabilityId, version) => {
      const existing = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (index) => (
          index.eq('capabilityId', capabilityId).eq('version', version)
        )).unique()
      return existing === null ? null : existing.contractDigest
    },
    loadPublicationAtRevision: async (publicationRef, revision) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) => (
          index.eq('publicationRef', publicationRef).eq('revision', revision)
        )).unique()
      if (publication === null) return null
      if (!isPublicOperationRef(publication.operationRef)) {
        throw new Error('capability_publication_operation_ref_invalid')
      }
      return {
        id: publication._id,
        operationRef: publication.operationRef,
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        networkId: publication.networkId,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        capabilityId: publication.capabilityId,
        version: publication.version,
        contractDigest: publication.contractDigest,
        disposition: publication.disposition,
        sourceRevision: publication.sourceRevision,
        sourceDigest: publication.sourceDigest,
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        provenanceDigest: publication.provenanceDigest,
      }
    },
    insertPublication: async (input) => {
      await ctx.db.insert('capabilityPublications', {
        operationRef: input.operationRef,
        publicationRef: input.publicationRef,
        revision: input.revision,
        businessId: input.businessId as Id<'businesses'>,
        networkId: input.networkId,
        sourceKind: input.sourceKind,
        sourceRevision: input.sourceRevision,
        sourceDigest: input.sourceDigest,
        publisherRef: input.publisherRef,
        authorityMode: input.authorityMode,
        provenanceDigest: input.provenanceDigest,
        capabilityId: input.capabilityId,
        version: input.version,
        contractDigest: input.contractDigest,
        offeringId: input.offeringId,
        bindingId: input.bindingId,
        disposition: input.disposition,
        credentialState: 'unobserved',
        healthState: 'unobserved',
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: [...input.registrationEvidenceRefs],
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        ...(input.supersedesRevision === undefined
          ? {}
          : { supersedesRevision: input.supersedesRevision }),
      })
    },
    patchPublicationSuperseded: async (publicationId, updatedAt) => {
      await ctx.db.patch(publicationId as Id<'capabilityPublications'>, {
        disposition: 'superseded',
        updatedAt,
      })
    },
    patchPublicationWithdrawn: async (publicationId, updatedAt) => {
      await ctx.db.patch(publicationId as Id<'capabilityPublications'>, {
        disposition: 'withdrawn',
        withdrawnAt: updatedAt,
        updatedAt,
      })
    },
    registerContractDocument: (documentJson, now) => (
      registerCapabilityContractDocument(ctx.db, documentJson, now)
    ),
    getExactRegisteredContract: (ref) => getExactRegisteredCapabilityContract(ctx.db, ref),
    scheduleReadinessProbe: async (publicationRef, expectedRevision) => {
      await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
        publicationRef,
        expectedRevision,
      })
    },
  }
}
