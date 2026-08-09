import {
  encodeCapabilityContractDocumentJson,
} from '@/modules/capability-contract-registry/public'
import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import type {
  ActionPreparationLineage,
} from '@/modules/customer-request/action-preparation'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'
import {
  preparedActionRecoveryReasonV2Value,
  preparedActionV2Value,
} from '@/modules/customer-request/runtime'
import type { CustomerRequestV2PreparedActionPorts } from '@/modules/customer-request/v2-preparation-egress'
import type { Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import {
  customerRequestV2PreparationEgressPorts,
  verifiedPreparationAuthority,
} from './customerRequestV2PreparationEgressPorts'

type DbCtx = MutationCtx | QueryCtx
type MutationDb = MutationCtx['db']
type StoredPreparedAction = Infer<typeof preparedActionV2Value>
type StoredRecoveryReason = Infer<typeof preparedActionRecoveryReasonV2Value>

export function customerRequestV2PreparedActionPorts(
  ctx: DbCtx,
): CustomerRequestV2PreparedActionPorts {
  const db = ctx.db
  const mutationDb = db as MutationDb
  const egress = customerRequestV2PreparationEgressPorts(ctx)

  return {
    loadPreparedActionCommand: async (commandKey) => {
      const prior = await db.query('customerRequestV2PreparedActionCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      if (prior === null) return null
      return {
        commandKey: prior.commandKey,
        commandDigest: prior.commandDigest,
        principalId: prior.principalId,
        preparationRef: prior.preparationRef,
        resultKind: prior.resultKind,
        resultRef: prior.resultRef,
        resultDigest: prior.resultDigest,
        committedAt: prior.committedAt,
      }
    },

    loadActionPreparationByRef: egress.loadActionPreparationByRef,

    verifyPreparationAuthority: async (preparation) => (
      await verifiedPreparationAuthority(db, preparation)
    ),

    loadRequestHead: egress.loadRequestHead,

    loadRevisionAggregate: egress.loadRevisionAggregate,

    listOperationsByPreparation: egress.listOperationsByPreparation,

    loadCapabilityContractModel: async (contractRef) => {
      const stored = await getActiveExactCapabilityContract(db, contractRef)
      if (stored.kind !== 'found') return { kind: 'missing' }
      try {
        return {
          kind: 'found',
          model: openCapabilityDecisionModel(
            encodeCapabilityContractDocumentJson(stored.documentJson).contract,
          ),
        }
      } catch {
        return { kind: 'missing' }
      }
    },

    loadPreparedActionByPreparation: async (preparationRef) => {
      const row = await db.query('customerRequestV2PreparedActions')
        .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef))
        .unique()
      if (row === null) return null
      return {
        preparedActionRef: row.preparedActionRef,
        preparedActionDigest: row.preparedActionDigest,
        preparationRef: row.preparationRef,
        preparedAction: structuredClone(row.preparedAction) as PreparedActionV2,
      }
    },

    loadPreparedActionByRef: async (preparedActionRef) => {
      const row = await db.query('customerRequestV2PreparedActions')
        .withIndex('by_preparedActionRef', (query) => (
          query.eq('preparedActionRef', preparedActionRef)
        )).unique()
      if (row === null) return null
      return {
        preparedActionRef: row.preparedActionRef,
        preparedActionDigest: row.preparedActionDigest,
        preparationRef: row.preparationRef,
        preparedAction: structuredClone(row.preparedAction) as PreparedActionV2,
      }
    },

    loadRecoveryByRef: async (recoveryRef) => {
      const row = await db.query('customerRequestV2PreparedActionRecoveries')
        .withIndex('by_recoveryRef', (query) => query.eq('recoveryRef', recoveryRef)).unique()
      if (row === null) return null
      return {
        recoveryRef: row.recoveryRef,
        recoveryDigest: row.recoveryDigest,
        preparationRef: row.preparationRef,
        lineage: structuredClone(row.lineage) as ActionPreparationLineage,
        reason: row.reason,
        operationRefs: [...row.operationRefs],
        evidenceRefs: [...row.evidenceRefs],
      }
    },

    insertPreparedAction: async (input) => {
      await mutationDb.insert('customerRequestV2PreparedActions', {
        preparedActionRef: input.preparedActionRef,
        preparedActionDigest: input.preparedActionDigest,
        preparationRef: input.preparationRef,
        requestId: input.requestId,
        requestRevision: input.requestRevision,
        actionId: input.actionId,
        lineage: structuredClone(input.lineage),
        preparedAction: writablePreparedAction(input.preparedAction),
        recordedAt: input.recordedAt,
      })
    },

    insertPreparedActionCommand: async (input) => {
      await mutationDb.insert('customerRequestV2PreparedActionCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        preparationRef: input.preparationRef,
        resultKind: input.resultKind,
        resultRef: input.resultRef,
        resultDigest: input.resultDigest,
        committedAt: input.committedAt,
      })
    },

    insertRecovery: async (input) => {
      await mutationDb.insert('customerRequestV2PreparedActionRecoveries', {
        recoveryRef: input.recoveryRef,
        recoveryDigest: input.recoveryDigest,
        preparationRef: input.preparationRef,
        lineage: structuredClone(input.lineage),
        reason: input.reason as StoredRecoveryReason,
        operationRefs: [...input.operationRefs],
        evidenceRefs: [...input.evidenceRefs],
        observedAt: input.observedAt,
      })
    },

    listAllocationsByOperation: egress.listAllocationsByOperation,

    loadSupplyGraphForOperation: async (input) => {
      const [offering, binding, business] = await Promise.all([
        db.query('capabilityOfferings')
          .withIndex('by_offeringId', (query) => query.eq('offeringId', input.offeringId))
          .unique(),
        db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId))
          .unique(),
        db.get(input.businessId as Id<'businesses'>),
      ])
      if (offering === null || binding === null) return null
      return {
        offering: {
          businessId: String(offering.businessId),
          offeringId: offering.offeringId,
          registrationHash: offering.registrationHash,
          registrationEvidenceRefs: [...offering.registrationEvidenceRefs],
          presentation: structuredClone(offering.presentation),
          status: offering.status,
          capabilityId: offering.capabilityId,
          version: offering.version,
          contractDigest: offering.contractDigest,
        },
        binding: {
          bindingId: binding.bindingId,
          offeringId: binding.offeringId,
          registrationHash: binding.registrationHash,
          registrationEvidenceRefs: [...binding.registrationEvidenceRefs],
          cancellation: structuredClone(binding.cancellation),
          adapterId: binding.adapterId,
          configDigest: binding.configDigest,
          configJson: binding.configJson,
          endpointUrl: binding.endpointUrl,
          authority: binding.authority,
          admission: binding.admission,
          conformance: binding.conformance,
          capabilityId: binding.capabilityId,
          version: binding.version,
          contractDigest: binding.contractDigest,
        },
        business: business === null
          ? null
          : {
            businessId: String(business._id),
            name: business.name,
            publicStatus: business.publicStatus,
            claimStatus: business.claimStatus,
          },
      }
    },

    loadApprovalEvidence: async (approvalRef) => {
      const prior = await db.query('customerRequestV2PreparationApprovalEvidence')
        .withIndex('by_approvalRef', (query) => query.eq('approvalRef', approvalRef)).unique()
      if (prior === null) return null
      return {
        approvalRef: prior.approvalRef,
        approvalDigest: prior.approvalDigest,
        reviewDigest: prior.reviewDigest,
        authorityScopeDigest: prior.authorityScopeDigest,
        principalId: prior.principalId,
        ownerId: prior.ownerId,
        credentialId: prior.credentialId,
        lineage: structuredClone(prior.lineage) as ActionPreparationLineage,
        approval: structuredClone(prior.approval) as Readonly<Record<string, unknown>>,
      }
    },

    loadAuthorityReservation: egress.loadAuthorityReservation,
  }
}

function writablePreparedAction(action: PreparedActionV2): StoredPreparedAction {
  return {
    format: action.format,
    preparedActionRef: action.preparedActionRef,
    preparedActionDigest: action.preparedActionDigest,
    lineage: { ...action.lineage, contractRef: { ...action.lineage.contractRef } },
    business: { ...action.business },
    offering: {
      ...action.offering,
      registrationEvidenceRefs: [...action.offering.registrationEvidenceRefs],
    },
    binding: {
      ...action.binding,
      registrationEvidenceRefs: [...action.binding.registrationEvidenceRefs],
    },
    providerAssertion: {
      ...action.providerAssertion,
      evidence: action.providerAssertion.evidence.map((evidence) => ({ ...evidence })),
    },
    price: {
      ...action.price,
      components: action.price.components.map((component) => ({
        ...component, evidenceRefs: [...component.evidenceRefs],
      })),
    },
    materialTerms: action.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...action.commercialRelationship,
      evidenceRefs: [...action.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...action.cancellation, evidenceRefs: [...action.cancellation.evidenceRefs] },
    disclosure: { ...action.disclosure, allocationRefs: [...action.disclosure.allocationRefs] },
    comparison: action.comparison.kind === 'single_option'
      ? { ...action.comparison }
      : { ...action.comparison, comparedAssertionRefs: [...action.comparison.comparedAssertionRefs] },
    alternatives: action.alternatives.map((alternative) => ({
      ...alternative,
      evidence: alternative.evidence.map((evidence) => ({ ...evidence })),
      business: { ...alternative.business },
      offeringRegistrationEvidenceRefs: [...alternative.offeringRegistrationEvidenceRefs],
      bindingRegistrationEvidenceRefs: [...alternative.bindingRegistrationEvidenceRefs],
      price: {
        ...alternative.price,
        components: alternative.price.components.map((component) => ({
          ...component, evidenceRefs: [...component.evidenceRefs],
        })),
      },
      materialTerms: alternative.materialTerms.map((term) => ({ ...term })),
      commercialRelationship: {
        ...alternative.commercialRelationship,
        evidenceRefs: [...alternative.commercialRelationship.evidenceRefs],
      },
      cancellation: {
        ...alternative.cancellation,
        evidenceRefs: [...alternative.cancellation.evidenceRefs],
      },
      disclosure: { ...alternative.disclosure, allocationRefs: [...alternative.disclosure.allocationRefs] },
    })),
    fallbacks: action.fallbacks.map((fallback) => ({
      ...fallback,
      business: { ...fallback.business },
      offeringRegistrationEvidenceRefs: [...fallback.offeringRegistrationEvidenceRefs],
      bindingRegistrationEvidenceRefs: [...fallback.bindingRegistrationEvidenceRefs],
      commercialRelationship: {
        ...fallback.commercialRelationship,
        evidenceRefs: [...fallback.commercialRelationship.evidenceRefs],
      },
      allocationRefs: [...fallback.allocationRefs],
      evidenceRefs: [...fallback.evidenceRefs],
    })),
    preparedAt: action.preparedAt,
    expiresAt: action.expiresAt,
  }
}
