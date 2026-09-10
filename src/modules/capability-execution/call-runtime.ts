"use node";

import type { ActionCtx } from '../../../convex/_generated/server'
import {
  cancelRecovery,
  expireAuthorizationRecovery,
  readRecoveryStatus,
  reconcileRecovery,
  recoverCapabilityCall,
  recoveryArgs,
} from './call-worker/recover'
import { prepareCallRun } from './call-worker/runPreparation'
import { releaseCallRun } from './call-worker/runRelease'
import type { WorkerResult } from './call-worker/charge'
import { buildBrokeredX402Receipt } from './call-worker/brokeredX402'
import {
  configuredX402RpcUrl,
  configuredX402RpcUrls,
  readX402Authorization,
  readX402EvmReceipt,
  replayManagedX402SigningForRecovery,
} from './call-worker/x402Route'
import {
  invokeProviderConsequenceViaVercel,
  providerConsequenceX402PaymentCustodyAvailable,
} from './call-worker/providerConsequenceBridge'

/**
 * Execution-owned durable Call worker surface for the thin Convex host.
 * Claim/fence/attempt details remain behind capability-execution.
 */
export async function runCapabilityCall(
  ctx: ActionCtx,
  args: Readonly<{ callRef: string }>,
): Promise<WorkerResult> {
  return await runCapabilityCallWithAuthority(ctx, args, async () => true)
}

export async function runCapabilityCallWithAuthority(
  ctx: ActionCtx,
  args: Readonly<{ callRef: string }>,
  admitCurrentAuthority: () => Promise<boolean>,
): Promise<WorkerResult> {
  if (!await admitCurrentAuthority()) return { kind: 'none' }
  const prepared = await prepareCallRun(ctx, args)
  if (prepared.kind !== 'prepared') return prepared
  if (!await admitCurrentAuthority()) return { kind: 'none' }
  return await releaseCallRun(ctx, prepared)
}

export {
  buildBrokeredX402Receipt,
  cancelRecovery,
  configuredX402RpcUrl,
  configuredX402RpcUrls,
  expireAuthorizationRecovery,
  invokeProviderConsequenceViaVercel,
  prepareCallRun,
  providerConsequenceX402PaymentCustodyAvailable,
  readRecoveryStatus,
  readX402Authorization,
  readX402EvmReceipt,
  reconcileRecovery,
  recoverCapabilityCall,
  recoveryArgs,
  replayManagedX402SigningForRecovery,
}
export type { WorkerResult }
