import { operationIntegrityValid } from './integrity'
import type { CustomerRequestV2PreparationEgressPorts } from './ports'
import type {
  OpenReconciliationArgs,
  OpenReconciliationResult,
  StatusArgs,
  StatusResult,
  UnresolvedForRequestArgs,
  UnresolvedOperation,
} from './types'

export async function egressStatus(
  args: StatusArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<StatusResult> {
  const rows = await ports.listOperationsByPreparation(args.preparationRef, 65)
  const states = rows.flatMap(({ operationRef, state, lineage }) => (
    lineage.principalId === args.principalId ? [{ operationRef, state }] : []
  )).sort((a, b) => a.operationRef.localeCompare(b.operationRef))
  return { operationCount: states.length, states }
}

export async function unresolvedForRequest(
  args: UnresolvedForRequestArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<UnresolvedOperation[]> {
  const rows = await ports.listOperationsByRequest({
    requestId: args.requestId,
    principalId: args.principalId,
    limit: 65,
  })
  if (rows.length > 64) throw new Error('customer_request_v2_egress_operation_limit_exceeded')
  return rows.flatMap((operation) => {
    if (operation.state !== 'allocated'
      && operation.state !== 'dispatching'
      && operation.state !== 'uncertain') return []
    if (!operationIntegrityValid(operation)) {
      throw new Error('customer_request_v2_egress_operation_integrity_failure')
    }
    return [{
      operationRef: operation.operationRef,
      requestRevision: operation.lineage.requestRevision,
    }]
  })
}

export async function openReconciliation(
  args: OpenReconciliationArgs,
  ports: CustomerRequestV2PreparationEgressPorts,
): Promise<OpenReconciliationResult> {
  const operation = await ports.loadOperationByRef(args.operationRef)
  if (operation === null
    || operation.state !== 'uncertain'
    || operation.lineage.principalId !== args.principalId) {
    return { kind: 'unavailable' }
  }
  if (!operationIntegrityValid(operation)) {
    throw new Error('customer_request_v2_egress_operation_integrity_failure')
  }
  return {
    kind: 'available',
    endpointUrl: operation.endpointUrl,
    ...(operation.connectionAuthority === undefined
      ? {}
      : { connectionAuthority: operation.connectionAuthority }),
    credentialRef: operation.credentialRef,
    adapterId: operation.adapterId,
    configJson: operation.adapterConfigJson,
    canonicalClaimMaterial: operation.canonicalClaimMaterial,
  }
}
