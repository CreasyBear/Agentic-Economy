import type {
  DispatchLifecycleOpenPorts,
  DispatchLifecyclePorts,
  OpenDispatchResult,
} from '@/modules/customer-request/route-execution/machines'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { markUnknownOutcome, readRunProjection } from './customerRequestRouteExecutionJournalPorts'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

void markUnknownOutcome
void readRunProjection

export function dispatchLifecyclePorts(_ctx: MutationCtx): DispatchLifecyclePorts {
  return {
    now: () => Date.now(),
    loadDispatchByRef: unlistedCustomerRequestTables,
    loadAttemptByRef: unlistedCustomerRequestTables,
    loadActiveMandateForPrincipal: unlistedCustomerRequestTables,
    loadEligibleExactCapabilitySupply: unlistedCustomerRequestTables,
    loadPublicationAtRevision: unlistedCustomerRequestTables,
    loadRunByRef: unlistedCustomerRequestTables,
    loadRunProjection: unlistedCustomerRequestTables,
    commitMarkDispatched: unlistedCustomerRequestTables,
    commitNotReleasedFailed: unlistedCustomerRequestTables,
  }
}

export function dispatchLifecycleOpenPorts(
  _ctx: QueryCtx | MutationCtx,
): DispatchLifecycleOpenPorts {
  return {
    now: () => Date.now(),
    loadDispatchByRef: unlistedCustomerRequestTables,
    loadAttemptByRef: unlistedCustomerRequestTables,
    loadRunByRef: unlistedCustomerRequestTables,
    loadActiveMandateForPrincipal: unlistedCustomerRequestTables,
    loadEligibleExactCapabilitySupply: unlistedCustomerRequestTables,
    loadPublicationAtRevision: unlistedCustomerRequestTables,
  }
}

export async function openDispatchFromJournal(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<OpenDispatchResult> {
  return unlistedCustomerRequestTables()
}
