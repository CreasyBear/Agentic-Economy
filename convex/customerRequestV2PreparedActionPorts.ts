import type {
  CustomerRequestV2PreparedActionPorts,
} from '@/modules/customer-request/v2-preparation-egress'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type DbCtx = MutationCtx | QueryCtx

export function customerRequestV2PreparedActionPorts(
  _ctx: DbCtx,
): CustomerRequestV2PreparedActionPorts {
  return {
    loadPreparedActionCommand: unlistedCustomerRequestTables,
    loadActionPreparationByRef: unlistedCustomerRequestTables,
    verifyPreparationAuthority: unlistedCustomerRequestTables,
    loadRequestHead: unlistedCustomerRequestTables,
    loadRevisionAggregate: unlistedCustomerRequestTables,
    listOperationsByPreparation: unlistedCustomerRequestTables,
    loadCapabilityContractModel: unlistedCustomerRequestTables,
    loadPreparedActionByPreparation: unlistedCustomerRequestTables,
    loadPreparedActionByRef: unlistedCustomerRequestTables,
    loadRecoveryByRef: unlistedCustomerRequestTables,
    insertPreparedAction: unlistedCustomerRequestTables,
    insertPreparedActionCommand: unlistedCustomerRequestTables,
    insertRecovery: unlistedCustomerRequestTables,
    listAllocationsByOperation: unlistedCustomerRequestTables,
    loadSupplyGraphForOperation: unlistedCustomerRequestTables,
    loadApprovalEvidence: unlistedCustomerRequestTables,
    loadAuthorityReservation: unlistedCustomerRequestTables,
  }
}
