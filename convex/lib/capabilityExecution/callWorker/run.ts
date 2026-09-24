"use node";

import { v } from 'convex/values'
import {
  runCapabilityCallWithAuthority,
  type WorkerResult,
} from '@/modules/capability-execution/call-runtime'
import type { ActionCtx } from '../../../_generated/server'
import { reconcileCallWorkloadAuthority } from './authority'

export const runArgs = { callRef: v.string() }
export const runResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('none') }),
)

export async function runHandler(ctx: ActionCtx, args: { callRef: string }): Promise<WorkerResult> {
  return await runCapabilityCallWithAuthority(
    ctx,
    args,
    async () => await reconcileCallWorkloadAuthority(ctx, args.callRef) !== null,
  )
}
