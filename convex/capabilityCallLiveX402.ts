"use node"

import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { jsonObject } from '@/modules/capability-execution/convex'
import { inspectLiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import type { CapabilityContract } from '@/modules/capability-contract/public'
import type { LiveX402InspectionTarget } from '@/modules/capability-execution/live-x402-requirement'
import { principalValue } from './lib/callLifecycle/contracts'

const liveRequirementResult = v.union(
  v.object({ kind: v.literal('operation_not_found') }),
  v.object({ kind: v.literal('operation_unsupported') }),
  v.object({ kind: v.literal('not_required') }),
  v.object({
    kind: v.literal('observed'),
    requirement: v.object({
      requirementDigest: v.string(),
      requirementJson: v.string(),
      paymentRequiredJson: v.string(),
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
  args: { toolRef: v.string(), input: jsonObject, principal: principalValue },
  returns: liveRequirementResult,
  handler: async (ctx, args): Promise<Infer<typeof liveRequirementResult>> => {
    const snapshot = await ctx.runQuery(
      internal.capabilitySupplyCurrentTool.readManagedX402InspectionSnapshot,
      { toolRef: args.toolRef },
    )
    if (snapshot === null) {
      const strict = await ctx.runQuery(internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot, { toolRef: args.toolRef })
      const operation = strict === null ? undefined : parsePublishedToolSnapshot(strict.toolJson)
      if (operation === undefined) return { kind: 'operation_not_found' as const }
      return operation.pricingConfig.kind === 'fixed_aud' ? { kind: 'not_required' as const } : { kind: 'refused' as const }
    }
    const operation = JSON.parse(snapshot.targetJson) as LiveX402InspectionTarget & { targetDigest: string; contract: CapabilityContract }
    try {
      if (openCapabilityDecisionModel(operation.contract).validateInput(args.input).kind !== 'valid') return { kind: 'refused' as const }
    } catch { return { kind: 'refused' as const } }
    const result = await inspectLiveX402Requirement(operation, args.input, {
      beforeSend: async () => {
        const current = await ctx.runQuery(internal.capabilitySupplyCurrentTool.readManagedX402InspectionSnapshot, { toolRef: args.toolRef })
        if (current?.targetJson !== snapshot.targetJson) return false
        const principal = await ctx.runMutation(internal.capabilityCalls.resolveCallAgentAuthority, {
          principal: args.principal, toolRef: args.toolRef,
        })
        return principal !== null && principal.environment === operation.runtimeEnvironment
          && (principal.authorityMode === 'spending_policy' || principal.authorityMode === 'unrestricted_test_only')
      },
    })
    if (result.kind !== 'observed') return result
    const recorded = await ctx.runMutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, {
      toolRef: args.toolRef, targetDigest: operation.targetDigest,
      requirementDigest: result.requirement.requirementDigest, observedAt: result.requirement.observedAt,
    })
    return recorded ? result : { kind: 'refused' as const }
  },
})
