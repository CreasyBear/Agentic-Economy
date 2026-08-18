import type { CustomerRequestV2WritePorts } from '@/modules/customer-request/v2-write'

import type { MutationCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'
import { customerRequestV2ReadPorts } from './customerRequestV2ReadPorts'

export function customerRequestV2WritePorts(_ctx: MutationCtx): CustomerRequestV2WritePorts {
  void customerRequestV2ReadPorts(_ctx)
  return {
    loadCommitCommand: unlistedCustomerRequestTables,
    verifyCommitCommandReplay: unlistedCustomerRequestTables,
    validateAggregateAgainstCurrentCapabilityGraph: unlistedCustomerRequestTables,
    loadRequestHead: unlistedCustomerRequestTables,
    loadRoutePlanHead: unlistedCustomerRequestTables,
    loadRevision: unlistedCustomerRequestTables,
    loadGenerationByNumber: unlistedCustomerRequestTables,
    loadExactRoutePlanGeneration: unlistedCustomerRequestTables,
    supersedeCurrentRouteMandate: unlistedCustomerRequestTables,
    insertRevision: unlistedCustomerRequestTables,
    insertRoutePlanGeneration: unlistedCustomerRequestTables,
    insertRoutePlanHead: unlistedCustomerRequestTables,
    patchRoutePlanHead: unlistedCustomerRequestTables,
    insertRequestHead: unlistedCustomerRequestTables,
    patchRequestHead: unlistedCustomerRequestTables,
    insertCommitCommand: unlistedCustomerRequestTables,
    loadGenerationCommand: unlistedCustomerRequestTables,
    readGenerationRefreshCommandResult: unlistedCustomerRequestTables,
    insertGenerationCommand: unlistedCustomerRequestTables,
  }
}
