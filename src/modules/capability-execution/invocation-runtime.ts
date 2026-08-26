"use node";

import type { ActionCtx } from '../../../convex/_generated/server'
import {
  recoverCapabilityOperationInvocation,
  recoveryArgs,
} from './invocation-worker/recover'
import { prepareInvocationRun } from './invocation-worker/runPreparation'
import { releaseInvocationRun } from './invocation-worker/runRelease'
import type { WorkerResult } from './invocation-worker/charge'

/**
 * Execution-owned durable Call worker surface for the thin Convex host.
 * Claim/fence/attempt details remain behind capability-execution.
 */
export async function runCapabilityOperationInvocation(
  ctx: ActionCtx,
  args: Readonly<{ invocationRef: string }>,
): Promise<WorkerResult> {
  return await runCapabilityOperationInvocationWithAuthority(ctx, args, async () => true)
}

export async function runCapabilityOperationInvocationWithAuthority(
  ctx: ActionCtx,
  args: Readonly<{ invocationRef: string }>,
  admitCurrentAuthority: () => Promise<boolean>,
): Promise<WorkerResult> {
  if (!await admitCurrentAuthority()) return { kind: 'none' }
  const prepared = await prepareInvocationRun(ctx, args)
  if (prepared.kind !== 'prepared') return prepared
  if (!await admitCurrentAuthority()) return { kind: 'none' }
  return await releaseInvocationRun(ctx, prepared)
}

export {
  recoverCapabilityOperationInvocation,
  recoveryArgs,
}
export type { WorkerResult }
export {
  createJitProviderConsequenceBoundary,
  ProviderConsequencePreReleaseRefusal,
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
} from './invocation-worker/jitProviderConsequence'
export type {
  CanonicalProviderConsequenceTicket,
  JitProviderConsequenceBoundary,
  JitProviderConsequenceBoundaryOptions,
  JitProviderX402Runtime,
  JitProviderX402RuntimeFactory,
  ProviderConsequenceJournal,
  ProviderConsequenceJournalBegin,
  ProviderConsequenceJournalBeginResult,
  ProviderConsequenceJsonValue,
  ProviderConsequenceTicketVerifier,
} from './invocation-worker/jitProviderConsequence'
export { readX402EvmReceipt } from './invocation-worker/x402Settlement'
