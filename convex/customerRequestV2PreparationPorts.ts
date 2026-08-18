import type { CustomerRequestV2PreparationPorts } from '@/modules/customer-request/v2-preparation'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type DbCtx = MutationCtx | QueryCtx

export function customerRequestV2PreparationPorts(
  _ctx: DbCtx,
): CustomerRequestV2PreparationPorts {
  return {
    loadPreparationCommand: unlistedCustomerRequestTables,
    verifyPreparationCommandReplay: unlistedCustomerRequestTables,
    loadCurrentAggregate: unlistedCustomerRequestTables,
    loadActionCapabilityModel: unlistedCustomerRequestTables,
    loadActionPreparation: unlistedCustomerRequestTables,
    loadDisclosureReview: unlistedCustomerRequestTables,
    insertDisclosureReview: unlistedCustomerRequestTables,
    loadApprovalEvidence: unlistedCustomerRequestTables,
    insertApprovalEvidence: unlistedCustomerRequestTables,
    loadAuthorityReservation: unlistedCustomerRequestTables,
    insertAuthorityReservation: unlistedCustomerRequestTables,
    insertActionPreparation: unlistedCustomerRequestTables,
    patchActionPreparation: unlistedCustomerRequestTables,
    insertPreparationCommand: unlistedCustomerRequestTables,
    loadRequestHead: unlistedCustomerRequestTables,
    loadVerifiedRevision: unlistedCustomerRequestTables,
  }
}
