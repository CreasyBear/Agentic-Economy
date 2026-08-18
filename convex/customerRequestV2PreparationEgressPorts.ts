import type { CustomerRequestV2Aggregate } from '@/modules/customer-request/compiler'
import type {
  DurableActionPreparation,
} from '@/modules/customer-request/action-preparation'
import type {
  CustomerRequestV2PreparationEgressPorts,
  EgressOperationRow,
} from '@/modules/customer-request/v2-preparation-egress'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type DbCtx = MutationCtx | QueryCtx

export function customerRequestV2PreparationEgressPorts(
  _ctx: DbCtx,
): CustomerRequestV2PreparationEgressPorts {
  return {
    loadEgressCommand: unlistedCustomerRequestTables,
    insertEgressCommand: unlistedCustomerRequestTables,
    loadActionPreparationByRef: unlistedCustomerRequestTables,
    verifyPreparationAuthority: unlistedCustomerRequestTables,
    loadRequestHead: unlistedCustomerRequestTables,
    loadRevisionAggregate: unlistedCustomerRequestTables,
    listRouteableSupplies: unlistedCustomerRequestTables,
    loadAuthorityReservation: unlistedCustomerRequestTables,
    listOperationsByPreparation: unlistedCustomerRequestTables,
    listOperationsByRequest: unlistedCustomerRequestTables,
    loadOperationByRef: unlistedCustomerRequestTables,
    insertOperation: unlistedCustomerRequestTables,
    patchOperation: unlistedCustomerRequestTables,
    loadConsumption: unlistedCustomerRequestTables,
    insertConsumption: unlistedCustomerRequestTables,
    replaceConsumption: unlistedCustomerRequestTables,
    insertDisclosureAllocation: unlistedCustomerRequestTables,
    listAllocationsByOperation: unlistedCustomerRequestTables,
    loadReconciliationObservation: unlistedCustomerRequestTables,
    insertReconciliationObservation: unlistedCustomerRequestTables,
  }
}

export async function verifiedPreparationAuthority(
  _db: QueryCtx['db'],
  ..._rest: unknown[]
): Promise<boolean> {
  return unlistedCustomerRequestTables()
}

export function toOperationRow(
  ..._rest: unknown[]
): EgressOperationRow {
  return unlistedCustomerRequestTables()
}

void (null as unknown as CustomerRequestV2Aggregate)
void (null as unknown as DurableActionPreparation)
