"use node"

import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { jsonObject } from '@/modules/capability-execution/convex'
import { inspectLiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { parsePublishedOperationSnapshot } from '@/modules/capability-supply/public'

const liveRequirementResult = v.union(
  v.object({ kind: v.literal('operation_not_found') }),
  v.object({ kind: v.literal('operation_unsupported') }),
  v.object({ kind: v.literal('not_required') }),
  v.object({
    kind: v.literal('observed'),
    requirement: v.object({
      requirementDigest: v.string(),
      requirementJson: v.string(),
      observedAt: v.number(),
    }),
  }),
  v.object({ kind: v.literal('refused') }),
)

/**
 * Keeps the one bounded, unpaid Provider probe in Convex's Node runtime.
 * State mutations and public action entrypoints remain in the default runtime.
 */
export const inspect = internalAction({
  args: { operationRef: v.string(), input: jsonObject },
  returns: liveRequirementResult,
  handler: async (ctx, args) => {
    const snapshot = await ctx.runQuery(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef: args.operationRef },
    )
    if (snapshot === null) return { kind: 'operation_not_found' as const }
    const operation = parsePublishedOperationSnapshot(snapshot.operationJson)
    if (operation === undefined) return { kind: 'operation_unsupported' as const }
    return await inspectLiveX402Requirement(operation, args.input)
  },
})
