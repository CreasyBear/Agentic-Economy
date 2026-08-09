import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { DurableActionPreparation } from '@/modules/customer-request/action-preparation'
import type { PreparedActionV2 } from '@/modules/customer-request/prepared-action-v2'
import {
  aggregateIntegrityValid,
  preparationIntegrityValid,
} from '@/modules/customer-request/v2-preparation'

import type {
  DisclosureAllocationRow,
  EgressOperationRow,
  PreparedActionRecoveryRow,
} from './types'

export { aggregateIntegrityValid, preparationIntegrityValid }

export function operationIntegrityValid(
  operation: Pick<
    EgressOperationRow,
    | 'operationRef'
    | 'operationDigest'
    | 'preparationRef'
    | 'requestId'
    | 'principalId'
    | 'authorityReference'
    | 'authorityScopeDigest'
    | 'lineage'
    | 'businessId'
    | 'offeringId'
    | 'bindingId'
    | 'offeringRegistrationHash'
    | 'bindingRegistrationHash'
    | 'adapterId'
    | 'adapterConfigDigest'
    | 'adapterConfigJson'
    | 'endpointUrl'
    | 'credentialRef'
    | 'connectionAuthority'
    | 'projectedInputDigest'
    | 'canonicalClaimMaterial'
  >,
): boolean {
  const material = {
    preparationRef: operation.preparationRef,
    requestId: operation.requestId,
    principalId: operation.principalId,
    authorityReference: operation.authorityReference,
    authorityScopeDigest: operation.authorityScopeDigest,
    lineage: operation.lineage,
    businessId: operation.businessId,
    offeringId: operation.offeringId,
    bindingId: operation.bindingId,
    offeringRegistrationHash: operation.offeringRegistrationHash,
    bindingRegistrationHash: operation.bindingRegistrationHash,
    adapterId: operation.adapterId,
    adapterConfigDigest: operation.adapterConfigDigest,
    ...(operation.connectionAuthority === undefined
      ? {}
      : { connectionAuthority: operation.connectionAuthority }),
    adapterConfigJson: operation.adapterConfigJson,
    endpointUrl: operation.endpointUrl,
    credentialRef: operation.credentialRef,
    projectedInputDigest: operation.projectedInputDigest,
  }
  return canonicalDigest(material as StableHashValue) === operation.operationDigest
    && operation.operationRef === `preparation-egress:${operation.operationDigest}`
    && operation.requestId === operation.lineage.requestId
    && operation.principalId === operation.lineage.principalId
    && canonicalClaimMaterialValid(operation)
}

function canonicalClaimMaterialValid(
  operation: Pick<EgressOperationRow, 'operationRef' | 'principalId' | 'requestId' | 'lineage' | 'projectedInputDigest' | 'canonicalClaimMaterial'>,
): boolean {
  const material = operation.canonicalClaimMaterial
  if (material === undefined) return false
  return material.invocationRef === `action-invocation:customer-request-preparation:${operation.operationRef}`
    && material.sourceRef === operation.operationRef
    && material.invocationVersion === 1
    && material.actor.callerRef === 'runtime:customer-request-preparation-egress'
    && material.actor.principalRef === operation.principalId
    && material.origin.kind === 'request_owned'
    && material.origin.requestRef === operation.requestId
    && material.origin.revision === operation.lineage.requestRevision
    && material.action.id === operation.lineage.actionId
    && material.action.contractVersion === String(operation.lineage.contractRef.version)
    && material.materialInputDigest === operation.projectedInputDigest
    && material.attempt.attemptRef === `action-attempt:customer-request-preparation:${operation.operationRef}`
    && material.attempt.attemptNumber === 1
    && material.attempt.effectGeneration === 1
    && material.attempt.operationKey === operation.operationRef
    && material.attempt.leaseOwner === 'runtime:customer-request-preparation-egress'
}

export function allocationIntegrityValid(
  allocation: Pick<
    DisclosureAllocationRow,
    | 'allocationRef'
    | 'allocationDigest'
    | 'operationRef'
    | 'preparationRef'
    | 'authorityReference'
    | 'authorityScopeDigest'
    | 'lineage'
    | 'declarationKey'
    | 'inputKey'
    | 'inputPointer'
    | 'schemaIdentity'
    | 'classification'
    | 'purpose'
    | 'effect'
    | 'declaredRecipient'
    | 'businessId'
    | 'offeringId'
    | 'bindingId'
    | 'offeringRegistrationHash'
    | 'bindingRegistrationHash'
    | 'valueDigest'
  >,
): boolean {
  const material = {
    operationRef: allocation.operationRef,
    preparationRef: allocation.preparationRef,
    authorityReference: allocation.authorityReference,
    authorityScopeDigest: allocation.authorityScopeDigest,
    lineage: allocation.lineage,
    declarationKey: allocation.declarationKey,
    inputKey: allocation.inputKey,
    inputPointer: allocation.inputPointer,
    schemaIdentity: allocation.schemaIdentity,
    classification: allocation.classification,
    purpose: allocation.purpose,
    effect: allocation.effect,
    declaredRecipient: allocation.declaredRecipient,
    businessId: allocation.businessId,
    offeringId: allocation.offeringId,
    bindingId: allocation.bindingId,
    offeringRegistrationHash: allocation.offeringRegistrationHash,
    bindingRegistrationHash: allocation.bindingRegistrationHash,
    valueDigest: allocation.valueDigest,
  }
  return canonicalDigest(material as StableHashValue) === allocation.allocationDigest
    && allocation.allocationRef === `preparation-disclosure:${allocation.allocationDigest}`
}

export function recoveryIntegrityValid(
  recovery: Pick<
    PreparedActionRecoveryRow,
    | 'recoveryRef'
    | 'recoveryDigest'
    | 'preparationRef'
    | 'lineage'
    | 'reason'
    | 'operationRefs'
    | 'evidenceRefs'
  >,
): boolean {
  const material = {
    preparationRef: recovery.preparationRef,
    lineage: recovery.lineage,
    reason: recovery.reason,
    operationRefs: recovery.operationRefs,
    evidenceRefs: recovery.evidenceRefs,
  }
  return canonicalDigest(material as StableHashValue) === recovery.recoveryDigest
    && recovery.recoveryRef === `prepared-action-recovery:${recovery.recoveryDigest}`
}

export function preparedActionIntegrityValid(action: PreparedActionV2): boolean {
  const { preparedActionDigest, ...material } = action
  return new TextEncoder().encode(JSON.stringify(action)).byteLength <= 512 * 1024
    && canonicalDigest(material as StableHashValue) === preparedActionDigest
    && action.preparedActionRef.startsWith('prepared-action:v2:')
}

export function terminalMaterialDigest(
  preparationDigest: string,
  operations: readonly Pick<
    EgressOperationRow,
    | 'operationRef'
    | 'state'
    | 'evidenceRef'
    | 'responseStatus'
    | 'responseContentType'
    | 'responseBodyDigest'
    | 'offeringRegistrationHash'
    | 'bindingRegistrationHash'
  >[],
): string {
  return canonicalDigest({
    preparationDigest,
    operations: operations.map((operation) => ({
      operationRef: operation.operationRef,
      state: operation.state,
      ...(operation.evidenceRef === undefined ? {} : { evidenceRef: operation.evidenceRef }),
      ...(operation.responseStatus === undefined ? {} : { responseStatus: operation.responseStatus }),
      ...(operation.responseContentType === undefined
        ? {}
        : { responseContentType: operation.responseContentType }),
      ...(operation.responseBodyDigest === undefined
        ? {}
        : { responseBodyDigest: operation.responseBodyDigest }),
      offeringRegistrationHash: operation.offeringRegistrationHash,
      bindingRegistrationHash: operation.bindingRegistrationHash,
    })).sort((left, right) => left.operationRef.localeCompare(right.operationRef)),
  } as StableHashValue)
}

function preparationDigestMatches(
  preparation: DurableActionPreparation,
  preparationDigest: string,
): boolean {
  return preparationIntegrityValid(preparation)
    && preparation.preparationDigest === preparationDigest
}
