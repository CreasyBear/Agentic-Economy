import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type {
  ReconcileUncertainArgs,
  ResolveDispatchArgs,
  TerminalEgressState,
} from './types'

export async function resolveDispatch(
  args: ResolveDispatchArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<TerminalEgressState> {
  const operation = await ports.loadOperationByRef(args.operationRef)
  if (operation === null) throw new Error('customer_request_v2_egress_operation_not_found')
  if (operation.dispatchAttemptRef !== args.dispatchAttemptRef) {
    throw new Error('customer_request_v2_egress_dispatch_attempt_mismatch')
  }
  if (operation.state !== 'dispatching') {
    if (operation.state === args.state) return operation.state
    if (args.state === 'released') {
      await ports.patchOperation({
        operationId: operation.operationId,
        patch: {
          state: 'released',
          resolvedAt: args.now,
          evidenceRef: args.evidenceRef,
          ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
          ...(args.responseContentType === undefined
            ? {}
            : { responseContentType: args.responseContentType }),
          ...(args.responseBodyDigest === undefined
            ? {}
            : { responseBodyDigest: args.responseBodyDigest }),
          ...(args.responseBodyText === undefined ? {} : { responseBodyText: args.responseBodyText }),
          failureCode: undefined,
        },
      })
      return 'released'
    }
    throw new Error('customer_request_v2_egress_invalid_resolution')
  }
  await ports.patchOperation({
    operationId: operation.operationId,
    patch: {
      state: args.state,
      resolvedAt: args.now,
      evidenceRef: args.evidenceRef,
      ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
      ...(args.responseContentType === undefined
        ? {}
        : { responseContentType: args.responseContentType }),
      ...(args.responseBodyDigest === undefined
        ? {}
        : { responseBodyDigest: args.responseBodyDigest }),
      ...(args.responseBodyText === undefined ? {} : { responseBodyText: args.responseBodyText }),
      ...(args.failureCode === undefined ? {} : { failureCode: args.failureCode }),
    },
  })
  return args.state
}

export async function reconcileUncertain(
  args: ReconcileUncertainArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<TerminalEgressState> {
  const operation = await ports.loadOperationByRef(args.operationRef)
  if (operation === null) throw new Error('customer_request_v2_egress_operation_not_found')
  const evidenceMaterial = {
    operationRef: args.operationRef,
    disposition: args.disposition,
    providerEvidenceRef: args.providerEvidenceRef,
    responseDigest: args.responseDigest,
  }
  if (canonicalDigest(evidenceMaterial as StableHashValue) !== args.evidenceDigest) {
    throw new Error('customer_request_v2_egress_reconciliation_evidence_invalid')
  }
  const observationMaterial = {
    ...evidenceMaterial,
    businessId: operation.businessId,
    offeringId: operation.offeringId,
    bindingId: operation.bindingId,
    offeringRegistrationHash: operation.offeringRegistrationHash,
    bindingRegistrationHash: operation.bindingRegistrationHash,
    observedAt: args.observedAt,
  }
  const observationDigest = canonicalDigest(observationMaterial as StableHashValue)
  const observationRef = `preparation-reconciliation:${observationDigest}`
  const prior = await ports.loadReconciliationObservation(observationRef)
  if (prior === null) {
    await ports.insertReconciliationObservation({
      observationRef,
      observationDigest,
      ...observationMaterial,
    })
  }
  if (operation.state !== 'uncertain') {
    return operation.state === 'released' || operation.state === 'not_released'
      ? operation.state
      : 'uncertain'
  }
  if (args.disposition !== 'uncertain') {
    await ports.patchOperation({
      operationId: operation.operationId,
      patch: {
        state: args.disposition,
        resolvedAt: args.observedAt,
        evidenceRef: args.providerEvidenceRef,
        failureCode: undefined,
      },
    })
  }
  return args.disposition
}
