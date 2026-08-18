import type {
  CancelMutationPorts,
  CancelOpenPorts,
} from '@/modules/customer-request/route-execution/machines'
import { cancelReplayKind } from '@/modules/customer-request/route-execution/journal'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

void cancelReplayKind

export function cancelMutationPorts(_ctx: MutationCtx): CancelMutationPorts {
  return {
    now: () => Date.now(),
    loadPriorCancelCommand: unlistedCustomerRequestTables,
    loadRunProjection: unlistedCustomerRequestTables,
    loadRunHead: unlistedCustomerRequestTables,
    loadRunByRef: unlistedCustomerRequestTables,
    loadAttemptAtPosition: unlistedCustomerRequestTables,
    loadAttemptByRef: unlistedCustomerRequestTables,
    loadDispatchByAttemptRef: unlistedCustomerRequestTables,
    loadCancellationAttempt: unlistedCustomerRequestTables,
    loadActiveMandateForCancellation: unlistedCustomerRequestTables,
    loadEligibleExactCapabilitySupply: unlistedCustomerRequestTables,
    commitCancelCommandReplay: unlistedCustomerRequestTables,
    commitPreReleaseCancel: unlistedCustomerRequestTables,
    commitPendingAdapterCancellation: unlistedCustomerRequestTables,
    commitCancelDispositionOnly: unlistedCustomerRequestTables,
    commitCancellationObservation: unlistedCustomerRequestTables,
    resolveCancellationCommand: unlistedCustomerRequestTables,
    commitAcceptedCancellation: unlistedCustomerRequestTables,
    queueNextStepAfterRejectedCancel: unlistedCustomerRequestTables,
    markUnknownAfterRejectedCancel: unlistedCustomerRequestTables,
  }
}

export function cancelOpenPorts(_ctx: QueryCtx | MutationCtx): CancelOpenPorts {
  return {
    now: () => Date.now(),
    loadCancellationAttempt: unlistedCustomerRequestTables,
    loadAttemptByRef: unlistedCustomerRequestTables,
    loadRunByRef: unlistedCustomerRequestTables,
    loadActiveMandateForCancellation: unlistedCustomerRequestTables,
    loadEligibleExactCapabilitySupply: unlistedCustomerRequestTables,
  }
}

async function patchPendingCancelCommandResult(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<void> {
  unlistedCustomerRequestTables()
}

void patchPendingCancelCommandResult
