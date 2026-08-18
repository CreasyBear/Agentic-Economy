import type {
  JournalMutationPorts,
  OutcomeResult,
  RunProjection,
} from '@/modules/customer-request/route-execution/machines'
import { decideSucceededOutcomeBranch } from '@/modules/customer-request/route-execution/journal'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

void decideSucceededOutcomeBranch

type DbCtx = MutationCtx | QueryCtx

export function journalMutationPorts(_ctx: MutationCtx): JournalMutationPorts {
  return {
    now: () => Date.now(),
    loadActiveMandateForPrincipal: unlistedCustomerRequestTables,
    loadPriorRunCommand: unlistedCustomerRequestTables,
    loadRunProjection: unlistedCustomerRequestTables,
    loadRunHead: unlistedCustomerRequestTables,
    loadRunByMandateRef: unlistedCustomerRequestTables,
    loadRunByRunRef: unlistedCustomerRequestTables,
    loadAttemptAtPosition: unlistedCustomerRequestTables,
    loadAttemptByRef: unlistedCustomerRequestTables,
    loadDispatchByAttemptRef: unlistedCustomerRequestTables,
    snapshotRouteBusinesses: unlistedCustomerRequestTables,
    materializeStepInput: unlistedCustomerRequestTables,
    admitRouteStep: unlistedCustomerRequestTables,
    commitCommandReplay: unlistedCustomerRequestTables,
    commitResumedRun: unlistedCustomerRequestTables,
    cancelPriorUnreleasedRun: unlistedCustomerRequestTables,
    commitStartedRun: unlistedCustomerRequestTables,
    validateAttemptOutput: unlistedCustomerRequestTables,
    commitPartialOutcome: unlistedCustomerRequestTables,
    commitUnknownOutcome: unlistedCustomerRequestTables,
    commitFailedOutcome: unlistedCustomerRequestTables,
    commitSucceededOutcome: unlistedCustomerRequestTables,
    loadSucceededReplay: unlistedCustomerRequestTables,
  }
}

export async function persistSucceededAttempt(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<void> {
  unlistedCustomerRequestTables()
}

export async function applyPendingCancellationReplay(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<OutcomeResult> {
  return unlistedCustomerRequestTables()
}

export async function applyTooLateCancellation(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<OutcomeResult> {
  return unlistedCustomerRequestTables()
}

export async function completeRunOnFinalStep(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<OutcomeResult> {
  return unlistedCustomerRequestTables()
}

export async function readRunProjection(
  _ctx: DbCtx,
  ..._rest: unknown[]
): Promise<RunProjection | null> {
  return unlistedCustomerRequestTables()
}

export async function markUnknownOutcome(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<boolean> {
  return unlistedCustomerRequestTables()
}

export async function queueNextStep(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<boolean> {
  return unlistedCustomerRequestTables()
}
