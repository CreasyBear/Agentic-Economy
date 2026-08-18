import type {
  EvidenceLoadPorts,
} from '@/modules/customer-request/route-execution/evidence-load'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type DbCtx = MutationCtx | QueryCtx

export function evidenceLoadPorts(_ctx: DbCtx): EvidenceLoadPorts {
  return {
    getRunHeadByRequestId: unlistedCustomerRequestTables,
    getRunByRunRef: unlistedCustomerRequestTables,
    listAttemptsByRunRef: unlistedCustomerRequestTables,
    getBindingByBindingId: unlistedCustomerRequestTables,
    listProblemsByRequestId: unlistedCustomerRequestTables,
    listProblemReportsNewest: unlistedCustomerRequestTables,
    listProblemUpdatesByReportRef: unlistedCustomerRequestTables,
    listProblemBusinessReportsByReportRef: unlistedCustomerRequestTables,
    now: () => Date.now(),
  }
}
