"use node";

import { v, type Infer, type ObjectType } from 'convex/values'
import { recoveryResultValue } from '@/modules/capability-execution/convex'
import {
  recoverCapabilityCall,
  recoveryArgs,
} from '@/modules/capability-execution/call-runtime'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { principalValue } from '../callLifecycle/contracts'
import { resolveBusinessActor } from '../../../authz'
import { reconcileCallWorkloadAuthority } from './authority'

type RecoveryResult = Infer<typeof recoveryResultValue>

export const recoverArgs = {
  ...recoveryArgs,
  recoveryPrincipal: v.optional(principalValue),
  recoverAsOwner: v.optional(v.literal(true)),
}
type RecoverArgs = Readonly<ObjectType<typeof recoverArgs>>
export const recoverResult = recoveryResultValue

async function authorizeInteractiveRecovery(ctx: ActionCtx, args: RecoverArgs): Promise<boolean> {
  if (args.recoveryPrincipal === undefined && args.recoverAsOwner === undefined) {
    return await reconcileCallWorkloadAuthority(ctx, args.callRef, args) !== null
  }
  if (args.mode !== 'status' && args.mode !== 'cancel' && args.mode !== 'reconcile') return false
  if (args.recoverAsOwner === true) {
    if (args.recoveryPrincipal !== undefined) return false
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return false
    const row = await ctx.runQuery(internal.capabilityCalls.readRecovery, {
      callRef: args.callRef,
      principalId: args.principalId,
    })
    return row !== null && row.ownerId === actor.canonicalAccountRef
  }
  return args.recoveryPrincipal !== undefined
    && args.recoveryPrincipal.principalId === args.principalId
    && await ctx.runMutation(internal.capabilityCalls.resolveCallAgentAuthority, {
      principal: args.recoveryPrincipal,
      callRef: args.callRef,
    }) !== null
}

export async function recoverHandler(ctx: ActionCtx, args: RecoverArgs): Promise<RecoveryResult> {
  // Public recovery authenticates the current credential independently from
  // the original identity retained on the Call and its effect evidence.
  const authorized = await authorizeInteractiveRecovery(ctx, args)
  if (!authorized) {
    return { kind: 'refused', callRef: args.callRef, code: 'invocation_not_found', retryable: false }
  }
  const result = await recoverCapabilityCall(ctx, args)
  if ('expiryDisposition' in result) {
    return {
      kind: 'reconciliation_required',
      callRef: result.callRef,
      toolRef: result.toolRef,
      evidence: result.evidence,
    }
  }
  return result
}
