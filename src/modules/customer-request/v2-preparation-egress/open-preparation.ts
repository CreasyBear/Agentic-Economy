import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { requestRegistrySnapshotDigest } from '@/modules/customer-request/evaluation'

import {
  aggregateIntegrityValid,
  preparationIntegrityValid,
} from './integrity'
import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type { OpenedPreparation } from './types'

export async function openReadyPreparation(
  ports: CustomerRequestV2PreparationEgressPorts,
  preparationRef: string,
  principalId: string,
): Promise<OpenedPreparation> {
  const row = await ports.loadActionPreparationByRef(preparationRef)
  if (row === null || row.lineage.principalId !== principalId || row.preparation.kind !== 'ready_for_routing') {
    return { kind: 'needs_attention', reason: 'preparation_not_ready' }
  }
  if (row.preparationDigest !== row.preparation.preparationDigest
    || row.preparationRef !== row.preparation.preparationRef
    || canonicalDigest(row.lineage as StableHashValue)
      !== canonicalDigest(row.preparation.lineage as StableHashValue)
    || !preparationIntegrityValid(row.preparation)) {
    throw new Error('customer_request_v2_egress_preparation_integrity_failure')
  }
  if (row.preparation.authorityReservation !== undefined
    && !await ports.verifyPreparationAuthority(row.preparation)) {
    return { kind: 'needs_attention', reason: 'authority_changed' }
  }
  const head = await ports.loadRequestHead(row.lineage.requestId)
  const aggregate = head === null
    ? null
    : await ports.loadRevisionAggregate({
      requestId: row.lineage.requestId,
      requestRevision: row.lineage.requestRevision,
    })
  if (head === null || aggregate === null || head.currentRevision !== row.lineage.requestRevision
    || head.currentAggregateDigest !== aggregate.aggregateDigest
    || aggregate.plan.planDigest !== row.lineage.planDigest
    || !aggregateIntegrityValid(aggregate)) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }
  const action = aggregate.plan.actions.find(({ actionId }) => actionId === row.lineage.actionId)
  if (action === undefined || !sameCapabilityContractRef(action.contractRef, row.lineage.contractRef)
    || action.selectionKey !== row.lineage.selectionKey || action.semanticDigest !== row.lineage.semanticDigest) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }
  const live = await ports.listEligibleSupplies({
    networkId: aggregate.snapshot.networkId,
    limit: 64,
  })
  if (live === null) return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  const registryBindings = live.map(({ offering, binding }) => ({
    businessId: String(offering.businessId),
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: {
      capabilityId: binding.capabilityId,
      version: binding.version,
      contractDigest: binding.contractDigest,
    },
    offeringRegistrationHash: offering.registrationHash,
    bindingRegistrationHash: binding.registrationHash,
    price: offering.presentation.price,
    commercialRelationship: {
      ...offering.presentation.commercialRelationship,
      evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: {
      ...binding.cancellation,
      evidenceRefs: [...binding.cancellation.evidenceRefs],
    },
  }))
  if (requestRegistrySnapshotDigest(registryBindings) !== aggregate.evaluation.registrySnapshotDigest) {
    return { kind: 'needs_attention', reason: 'capability_graph_changed' }
  }
  const viable = aggregate.evaluation.candidates.filter((candidate) => candidate.viability.kind === 'viable'
    && sameCapabilityContractRef(candidate.contractRef, row.lineage.contractRef)
    && candidate.selectionKey === row.lineage.selectionKey
    && candidate.semanticDigest === row.lineage.semanticDigest)
  const matching = live.filter(({ offering, binding }) => viable.some((candidate) => (
    String(offering.businessId) === candidate.businessId
    && offering.offeringId === candidate.offeringId
    && binding.bindingId === candidate.bindingId
    && offering.registrationHash === candidate.offeringRegistrationHash
    && binding.registrationHash === candidate.bindingRegistrationHash
  ))).sort((left, right) => String(left.offering.businessId).localeCompare(String(right.offering.businessId))
    || left.binding.bindingId.localeCompare(right.binding.bindingId))
  const selected = [...new Map(matching.map((supply) => [String(supply.offering.businessId), supply])).values()]
  if (selected.length === 0) return { kind: 'needs_attention', reason: 'no_eligible_bindings' }
  return {
    kind: 'ready',
    preparation: row.preparation,
    aggregate,
    action,
    supplies: selected,
  }
}
