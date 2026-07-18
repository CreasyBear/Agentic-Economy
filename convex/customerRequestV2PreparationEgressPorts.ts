import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  ActionPreparationLineage,
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'
import type {
  CustomerRequestV2PreparationEgressPorts,
  EgressOperationRow,
  EligibleSupply,
} from '@/modules/customer-request/v2-preparation-egress'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { listEligibleCapabilitySupply } from './capabilitySupply'

type DbCtx = MutationCtx | QueryCtx
type MutationDb = MutationCtx['db']

export function customerRequestV2PreparationEgressPorts(
  ctx: DbCtx,
): CustomerRequestV2PreparationEgressPorts {
  const db = ctx.db
  const mutationDb = db as MutationDb

  return {
    loadEgressCommand: async (commandKey) => {
      const prior = await db.query('customerRequestV2PreparationEgressCommands')
        .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
      if (prior === null) return null
      return {
        commandKey: prior.commandKey,
        commandDigest: prior.commandDigest,
        principalId: prior.principalId,
        preparationRef: prior.preparationRef,
        authorityReference: prior.authorityReference,
        operationRefs: [...prior.operationRefs],
        committedAt: prior.committedAt,
      }
    },

    insertEgressCommand: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationEgressCommands', {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        principalId: input.principalId,
        preparationRef: input.preparationRef,
        authorityReference: input.authorityReference,
        operationRefs: [...input.operationRefs],
        committedAt: input.committedAt,
      })
    },

    loadActionPreparationByRef: async (preparationRef) => {
      const row = await db.query('customerRequestV2ActionPreparations')
        .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef)).unique()
      if (row === null) return null
      return {
        preparationRef: row.preparationRef,
        preparationDigest: row.preparationDigest,
        lineage: structuredClone(row.lineage) as ActionPreparationLineage,
        preparation: structuredClone(row.preparation) as DurableActionPreparation,
      }
    },

    verifyPreparationAuthority: async (preparation) => (
      await verifiedPreparationAuthority(db, preparation)
    ),

    loadRequestHead: async (requestId) => {
      const head = await db.query('customerRequestV2Heads')
        .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
      if (head === null) return null
      return {
        requestId: head.requestId,
        currentRevision: head.currentRevision,
        currentAggregateDigest: head.currentAggregateDigest,
      }
    },

    loadRevisionAggregate: async (input) => {
      const revision = await db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => query
          .eq('requestId', input.requestId)
          .eq('requestRevision', input.requestRevision)).unique()
      if (revision === null) return null
      return structuredClone(revision.aggregate) as unknown as CustomerRequestV2Aggregate
    },

    listEligibleSupplies: async (input) => {
      const live = await listEligibleCapabilitySupply(db, {
        networkId: input.networkId,
        limit: input.limit,
      })
      if (live.kind !== 'available') return null
      return live.supplies.map(toEligibleSupply)
    },

    loadAuthorityReservation: async (reservationRef) => {
      const prior = await db.query('customerRequestV2PreparationAuthorityReservations')
        .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservationRef)).unique()
      if (prior === null) return null
      return {
        reservationRef: prior.reservationRef,
        reservationDigest: prior.reservationDigest,
        reservation: structuredClone(prior.reservation) as NonNullable<
          Extract<DurableActionPreparation, { kind: 'ready_for_routing' }>['authorityReservation']
        >,
      }
    },

    listOperationsByPreparation: async (preparationRef, limit) => {
      const rows = await db.query('customerRequestV2PreparationEgressOperations')
        .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef))
        .take(limit)
      return rows.map(toOperationRow)
    },

    listOperationsByRequest: async (input) => {
      const rows = await db.query('customerRequestV2PreparationEgressOperations')
        .withIndex('by_requestId_and_principalId', (query) => query
          .eq('requestId', input.requestId)
          .eq('principalId', input.principalId))
        .take(input.limit)
      return rows.map(toOperationRow)
    },

    loadOperationByRef: async (operationRef) => {
      const row = await db.query('customerRequestV2PreparationEgressOperations')
        .withIndex('by_operationRef', (query) => query.eq('operationRef', operationRef)).unique()
      return row === null ? null : toOperationRow(row)
    },

    insertOperation: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationEgressOperations', {
        ...input,
        businessId: input.businessId as Id<'businesses'>,
        lineage: structuredClone(input.lineage),
      })
    },

    patchOperation: async (input) => {
      await mutationDb.patch(
        input.operationId as Id<'customerRequestV2PreparationEgressOperations'>,
        input.patch,
      )
    },

    loadConsumption: async (authorityReference) => {
      const row = await db.query('customerRequestV2PreparationEgressConsumption')
        .withIndex('by_authorityReference', (query) => (
          query.eq('authorityReference', authorityReference)
        )).unique()
      if (row === null) return null
      return {
        consumptionId: String(row._id),
        authorityReference: row.authorityReference,
        authorityScopeDigest: row.authorityScopeDigest,
        preparationRef: row.preparationRef,
        maximumRecipients: row.maximumRecipients,
        maximumExposures: row.maximumExposures,
        maximumOperations: row.maximumOperations,
        consumedRecipients: row.consumedRecipients,
        consumedExposures: row.consumedExposures,
        consumedOperations: row.consumedOperations,
        updatedAt: row.updatedAt,
      }
    },

    insertConsumption: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationEgressConsumption', { ...input })
    },

    replaceConsumption: async (input) => {
      await mutationDb.replace(
        input.consumptionId as Id<'customerRequestV2PreparationEgressConsumption'>,
        { ...input.row },
      )
    },

    insertDisclosureAllocation: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationDisclosureAllocations', {
        ...input,
        businessId: input.businessId as Id<'businesses'>,
        lineage: structuredClone(input.lineage),
        effect: structuredClone(input.effect),
        declaredRecipient: structuredClone(input.declaredRecipient),
      })
    },

    listAllocationsByOperation: async (operationRef, limit) => {
      const rows = await db.query('customerRequestV2PreparationDisclosureAllocations')
        .withIndex('by_operationRef', (query) => query.eq('operationRef', operationRef))
        .take(limit)
      return rows.map((row) => ({
        allocationId: String(row._id),
        allocationRef: row.allocationRef,
        allocationDigest: row.allocationDigest,
        operationRef: row.operationRef,
        preparationRef: row.preparationRef,
        authorityReference: row.authorityReference,
        authorityScopeDigest: row.authorityScopeDigest,
        lineage: structuredClone(row.lineage) as ActionPreparationLineage,
        declarationKey: row.declarationKey,
        inputKey: row.inputKey,
        inputPointer: row.inputPointer,
        schemaIdentity: row.schemaIdentity,
        classification: row.classification,
        purpose: row.purpose,
        effect: structuredClone(row.effect),
        declaredRecipient: structuredClone(row.declaredRecipient),
        businessId: String(row.businessId),
        offeringId: row.offeringId,
        bindingId: row.bindingId,
        offeringRegistrationHash: row.offeringRegistrationHash,
        bindingRegistrationHash: row.bindingRegistrationHash,
        valueDigest: row.valueDigest,
        allocatedAt: row.allocatedAt,
      }))
    },

    loadReconciliationObservation: async (observationRef) => {
      const prior = await db.query('customerRequestV2PreparationReconciliationObservations')
        .withIndex('by_observationRef', (query) => query.eq('observationRef', observationRef))
        .unique()
      if (prior === null) return null
      return {
        observationRef: prior.observationRef,
        observationDigest: prior.observationDigest,
      }
    },

    insertReconciliationObservation: async (input) => {
      await mutationDb.insert('customerRequestV2PreparationReconciliationObservations', {
        observationRef: input.observationRef,
        observationDigest: input.observationDigest,
        operationRef: input.operationRef,
        disposition: input.disposition,
        providerEvidenceRef: input.providerEvidenceRef,
        responseDigest: input.responseDigest,
        businessId: input.businessId as Id<'businesses'>,
        offeringId: input.offeringId,
        bindingId: input.bindingId,
        offeringRegistrationHash: input.offeringRegistrationHash,
        bindingRegistrationHash: input.bindingRegistrationHash,
        observedAt: input.observedAt,
      })
    },
  }
}

export async function verifiedPreparationAuthority(
  db: QueryCtx['db'],
  preparation: Extract<DurableActionPreparation, { kind: 'ready_for_routing' }>,
): Promise<boolean> {
  const expected = preparation.authorityReservation
  if (expected === undefined) return true
  const reservation = await db.query('customerRequestV2PreparationAuthorityReservations')
    .withIndex('by_reservationRef', (query) => query.eq('reservationRef', expected.reservationRef))
    .unique()
  if (reservation === null) return false
  const {
    reservationDigest: _reservationDigest,
    reservationRef: _reservationRef,
    ...reservationMaterial
  } = expected
  if (canonicalDigest(reservationMaterial as StableHashValue) !== expected.reservationDigest
    || expected.reservationRef !== `action-authority-reservation:${expected.reservationDigest}`
    || reservation.reservationDigest !== expected.reservationDigest
    || canonicalDigest(reservation.reservation as StableHashValue)
      !== canonicalDigest(expected as StableHashValue)) {
    return false
  }
  const approval = await db.query('customerRequestV2PreparationApprovalEvidence')
    .withIndex('by_approvalRef', (query) => query.eq('approvalRef', expected.authorityReference))
    .unique()
  if (approval === null) return false
  const {
    approvalDigest: _approvalDigest,
    approvalRef: _approvalRef,
    ...approvalMaterial
  } = approval.approval
  return canonicalDigest(approvalMaterial as StableHashValue) === approval.approvalDigest
    && approval.approvalRef === `action-preparation-approval:${approval.approvalDigest}`
    && approval.approvalDigest === expected.approvalDigest
    && approval.reviewDigest === expected.reviewDigest
    && approval.authorityScopeDigest === expected.authorityScopeDigest
    && approval.principalId === expected.principalId
    && approval.ownerId === expected.ownerId
    && approval.credentialId === expected.credentialId
    && canonicalDigest(approval.lineage as StableHashValue)
      === canonicalDigest(expected.lineage as StableHashValue)
}

export function toOperationRow(
  row: Doc<'customerRequestV2PreparationEgressOperations'>,
): EgressOperationRow {
  return {
    operationId: String(row._id),
    operationRef: row.operationRef,
    operationDigest: row.operationDigest,
    preparationRef: row.preparationRef,
    requestId: row.requestId,
    principalId: row.principalId,
    authorityReference: row.authorityReference,
    authorityScopeDigest: row.authorityScopeDigest,
    lineage: structuredClone(row.lineage) as ActionPreparationLineage,
    businessId: String(row.businessId),
    offeringId: row.offeringId,
    bindingId: row.bindingId,
    offeringRegistrationHash: row.offeringRegistrationHash,
    bindingRegistrationHash: row.bindingRegistrationHash,
    adapterId: row.adapterId,
    adapterConfigDigest: row.adapterConfigDigest,
    adapterConfigJson: row.adapterConfigJson,
    endpointUrl: row.endpointUrl,
    credentialRef: row.credentialRef,
    projectedInputDigest: row.projectedInputDigest,
    state: row.state,
    allocatedAt: row.allocatedAt,
    ...(row.dispatchStartedAt === undefined ? {} : { dispatchStartedAt: row.dispatchStartedAt }),
    ...(row.dispatchAttemptRef === undefined ? {} : { dispatchAttemptRef: row.dispatchAttemptRef }),
    ...(row.dispatchLeaseExpiresAt === undefined
      ? {}
      : { dispatchLeaseExpiresAt: row.dispatchLeaseExpiresAt }),
    ...(row.resolvedAt === undefined ? {} : { resolvedAt: row.resolvedAt }),
    ...(row.evidenceRef === undefined ? {} : { evidenceRef: row.evidenceRef }),
    ...(row.responseStatus === undefined ? {} : { responseStatus: row.responseStatus }),
    ...(row.responseContentType === undefined
      ? {}
      : { responseContentType: row.responseContentType }),
    ...(row.responseBodyDigest === undefined
      ? {}
      : { responseBodyDigest: row.responseBodyDigest }),
    ...(row.responseBodyText === undefined ? {} : { responseBodyText: row.responseBodyText }),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
  }
}

function toEligibleSupply(supply: {
  offering: {
    offeringId: string
    businessId: string | { toString(): string }
    capabilityId: string
    version: number
    contractDigest: string
    presentation: EligibleSupply['offering']['presentation']
    status: string
    registrationHash: string
  }
  binding: {
    bindingId: string
    offeringId: string
    capabilityId: string
    version: number
    contractDigest: string
    endpointUrl: string
    credentialRef: string
    cancellation: EligibleSupply['binding']['cancellation']
    adapterId: string
    configJson: string
    configDigest: string
    admission: string
    conformance: string
    registrationHash: string
  }
}): EligibleSupply {
  const { offering, binding } = supply
  return {
    offering: {
      businessId: String(offering.businessId),
      offeringId: offering.offeringId,
      registrationHash: offering.registrationHash,
      registrationEvidenceRefs: [],
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
      registrationEvidenceRefs: [],
      cancellation: structuredClone(binding.cancellation),
      adapterId: binding.adapterId,
      configDigest: binding.configDigest,
      configJson: binding.configJson,
      endpointUrl: binding.endpointUrl,
      credentialRef: binding.credentialRef,
      admission: binding.admission,
      conformance: binding.conformance,
      capabilityId: binding.capabilityId,
      version: binding.version,
      contractDigest: binding.contractDigest,
    },
  }
}
