import type {
  ProblemMutationPorts,
  ProblemSupportReadPorts,
} from '@/modules/customer-request/route-execution/machines'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type DbCtx = MutationCtx | QueryCtx

export function problemMutationPorts(_ctx: MutationCtx): ProblemMutationPorts {
  return {
    now: () => Date.now(),
    loadRunHeadForProblem: unlistedCustomerRequestTables,
    loadPriorProblemReport: unlistedCustomerRequestTables,
    loadRunForProblem: unlistedCustomerRequestTables,
    loadAttemptAtPosition: unlistedCustomerRequestTables,
    commitProblemReport: unlistedCustomerRequestTables,
    resolveBusinessProblemAuthority: unlistedCustomerRequestTables,
    loadPriorBusinessClaim: unlistedCustomerRequestTables,
    commitBusinessClaim: unlistedCustomerRequestTables,
    resolveSupportAnnotateAuthority: unlistedCustomerRequestTables,
    loadProblemReportRef: unlistedCustomerRequestTables,
    loadPriorProblemUpdate: unlistedCustomerRequestTables,
    loadProblemUpdateRows: unlistedCustomerRequestTables,
    commitProblemUpdate: unlistedCustomerRequestTables,
  }
}

export function problemSupportReadPorts(_ctx: DbCtx): ProblemSupportReadPorts {
  return {
    now: () => Date.now(),
    loadSupportExportMaterial: unlistedCustomerRequestTables,
  }
}
