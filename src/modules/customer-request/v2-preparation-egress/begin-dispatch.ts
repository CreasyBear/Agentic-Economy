import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import {
  allocationIntegrityValid,
  operationIntegrityValid,
} from './integrity'
import { openReadyPreparation } from './open-preparation'
import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type {
  BeginDispatchArgs,
  BeginDispatchResult,
  EgressOperationRow,
} from './types'

const DISPATCH_LEASE_MS = 150_000

export async function beginDispatch(
  args: BeginDispatchArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<BeginDispatchResult> {
  const operation = await ports.loadOperationByRef(args.operationRef)
  if (operation === null || operation.lineage.principalId !== args.principalId) {
    return { kind: 'needs_attention' }
  }
  if (!operationIntegrityValid(operation)) {
    throw new Error('customer_request_v2_egress_operation_integrity_failure')
  }
  if (operation.state === 'dispatching') {
    if (operation.dispatchLeaseExpiresAt !== undefined && args.now < operation.dispatchLeaseExpiresAt) {
      return { kind: 'in_flight' }
    }
    await ports.patchOperation({
      operationId: operation.operationId,
      patch: {
        state: 'uncertain',
        resolvedAt: args.now,
        failureCode: 'dispatch_interrupted',
        evidenceRef: `ae:dispatch-interrupted:${operation.operationDigest}`,
      },
    })
    return { kind: 'terminal', state: 'uncertain' }
  }
  if (operation.state !== 'allocated') return { kind: 'terminal', state: operation.state }
  const opened = await openReadyPreparation(ports, operation.preparationRef, args.principalId)
  if (opened.kind !== 'ready') {
    await ports.patchOperation({
      operationId: operation.operationId,
      patch: {
        state: 'not_released',
        resolvedAt: args.now,
        failureCode: 'release_precondition_changed',
        evidenceRef: `ae:not-released:${canonicalDigest({
          operationRef: operation.operationRef,
          reason: opened.reason,
        })}`,
      },
    })
    return { kind: 'terminal', state: 'not_released' }
  }
  const supply = opened.supplies.find(({ offering, binding }) => (
    String(offering.businessId) === String(operation.businessId)
    && offering.offeringId === operation.offeringId
    && binding.bindingId === operation.bindingId
    && offering.registrationHash === operation.offeringRegistrationHash
    && binding.registrationHash === operation.bindingRegistrationHash
    && binding.adapterId === operation.adapterId
    && binding.configDigest === operation.adapterConfigDigest
    && binding.configJson === operation.adapterConfigJson
    && binding.endpointUrl === operation.endpointUrl
    && binding.credentialRef === operation.credentialRef
  ))
  if (supply === undefined
    || opened.preparation.authorityScope.authorityScopeDigest !== operation.authorityScopeDigest) {
    await markAllocatedNotReleased(ports, operation, args.now, 'release_binding_changed')
    return { kind: 'terminal', state: 'not_released' }
  }
  if (opened.preparation.authorityScope.declarations.some((declaration) => declaration.phase === 'preparation'
    && declaration.recipient.kind === 'candidate_binding'
    && (declaration.classification !== 'public' || declaration.effect.authority !== 'none'))
    && opened.preparation.authorityReservation?.reservationRef !== operation.authorityReference) {
    await markAllocatedNotReleased(ports, operation, args.now, 'release_authority_changed')
    return { kind: 'terminal', state: 'not_released' }
  }
  if (opened.preparation.authorityReservation !== undefined) {
    const reservation = await ports.loadAuthorityReservation(operation.authorityReference)
    if (reservation === null
      || reservation.reservationDigest !== opened.preparation.authorityReservation.reservationDigest
      || reservation.reservation.authorityScopeDigest !== operation.authorityScopeDigest) {
      await markAllocatedNotReleased(ports, operation, args.now, 'release_authority_changed')
      return { kind: 'terminal', state: 'not_released' }
    }
  }
  const allocations = await ports.listAllocationsByOperation(operation.operationRef, 257)
  if (allocations.length > 256) throw new Error('customer_request_v2_egress_allocation_limit_exceeded')
  const facts = allocations.map((allocation) => {
    if (!allocationIntegrityValid(allocation)
      || allocation.operationRef !== operation.operationRef
      || allocation.preparationRef !== operation.preparationRef
      || allocation.authorityReference !== operation.authorityReference
      || allocation.authorityScopeDigest !== operation.authorityScopeDigest
      || String(allocation.businessId) !== String(operation.businessId)
      || allocation.offeringId !== operation.offeringId
      || allocation.bindingId !== operation.bindingId
      || allocation.offeringRegistrationHash !== operation.offeringRegistrationHash
      || allocation.bindingRegistrationHash !== operation.bindingRegistrationHash
      || canonicalDigest(allocation.lineage as StableHashValue)
        !== canonicalDigest(operation.lineage as StableHashValue)) {
      throw new Error('customer_request_v2_egress_allocation_integrity_failure')
    }
    const declaration = opened.preparation.authorityScope.declarations.find((candidate) => (
      candidate.phase === 'preparation'
      && candidate.recipient.kind === 'candidate_binding'
      && candidate.declarationKey === allocation.declarationKey
      && candidate.classification === allocation.classification
      && canonicalDigest(candidate.recipient as StableHashValue)
        === canonicalDigest(allocation.declaredRecipient as StableHashValue)
      && candidate.purposes.includes(allocation.purpose)
      && canonicalDigest(candidate.effect as StableHashValue)
        === canonicalDigest(allocation.effect as StableHashValue)
      && candidate.inputs.some((item) => item.inputKey === allocation.inputKey
        && item.inputPointer === allocation.inputPointer
        && item.schemaIdentity === allocation.schemaIdentity)
    ))
    if (declaration === undefined) {
      throw new Error('customer_request_v2_egress_declaration_integrity_failure')
    }
    const fact = opened.action.inputs.find((candidate) => candidate.inputKey === allocation.inputKey
      && candidate.inputPointer === allocation.inputPointer
      && candidate.schemaIdentity === allocation.schemaIdentity)
    if (fact === undefined || canonicalDigest(fact.value as StableHashValue) !== allocation.valueDigest) {
      throw new Error('customer_request_v2_egress_value_integrity_failure')
    }
    return {
      declarationKey: allocation.declarationKey,
      inputKey: allocation.inputKey,
      inputPointer: allocation.inputPointer,
      schemaIdentity: allocation.schemaIdentity,
      value: fact.value,
      purpose: allocation.purpose,
    }
  })
  const dispatchAttemptRef = `preparation-dispatch:${canonicalDigest({
    operationRef: operation.operationRef,
    operationDigest: operation.operationDigest,
    startedAt: args.now,
  })}`
  await ports.patchOperation({
    operationId: operation.operationId,
    patch: {
      state: 'dispatching',
      dispatchStartedAt: args.now,
      dispatchAttemptRef,
      dispatchLeaseExpiresAt: args.now + DISPATCH_LEASE_MS,
    },
  })
  return {
    kind: 'dispatch',
    endpointUrl: operation.endpointUrl,
    credentialRef: operation.credentialRef,
    adapterId: operation.adapterId,
    configJson: operation.adapterConfigJson,
    dispatchAttemptRef,
    bodyText: stableStringify({
      protocol: 'ae.preparation-egress:v1',
      operationRef: operation.operationRef,
      contractRef: operation.lineage.contractRef,
      selectionKey: operation.lineage.selectionKey,
      semanticDigest: operation.lineage.semanticDigest,
      facts,
    } as StableHashValue),
  }
}

async function markAllocatedNotReleased(
  ports: CustomerRequestV2PreparationEgressPorts,
  operation: EgressOperationRow,
  now: number,
  failureCode: string,
): Promise<void> {
  await ports.patchOperation({
    operationId: operation.operationId,
    patch: {
      state: 'not_released',
      resolvedAt: now,
      failureCode,
      evidenceRef: `ae:not-released:${canonicalDigest({
        operationRef: operation.operationRef,
        failureCode,
      })}`,
    },
  })
}
