"use node"

import { v, type Infer } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { jsonObject } from '@/modules/capability-execution/convex'
import { inspectLiveX402Requirement, persistedManagedX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import type { CapabilityContract } from '@/modules/capability-contract/public'
import type { LiveX402InspectionTarget } from '@/modules/capability-execution/live-x402-requirement'
import { principalValue } from './lib/capabilityExecution/callLifecycle/contracts'
import { inspectLiveX402RequirementRef } from './lib/capabilityExecution/liveX402Requirement/requirementRef'

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
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)

/**
 * Keeps the one bounded, unpaid Provider probe in Convex's Node runtime.
 * State mutations and public action entrypoints remain in the default runtime.
 */
export const inspect = internalAction({
  args: { toolRef: v.string(), input: jsonObject, principal: principalValue, callRef: v.optional(v.string()),
    planNode: v.optional(v.object({ planRef: v.string(), nodeId: v.string() })) },
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
      return operation.pricingConfig.kind === 'fixed_aud' ? { kind: 'not_required' as const } : { kind: 'refused' as const, reason: 'tool_unsupported' }
    }
    const operation = JSON.parse(snapshot.targetJson) as LiveX402InspectionTarget & { targetDigest: string; contract: CapabilityContract }
    try {
      if (openCapabilityDecisionModel(operation.contract).validateInput(args.input).kind !== 'valid') return { kind: 'refused' as const, reason: 'input_invalid' }
    } catch (cause) { return degradeBackend(cause, { kind: 'refused' as const, reason: 'input_invalid' }, { site: 'inspect', reason: 'invalid_response' }) }
    const result = await inspectLiveX402Requirement(operation, args.input, {
      beforeSend: async () => {
        const current = await ctx.runQuery(internal.capabilitySupplyCurrentTool.readManagedX402InspectionSnapshot, { toolRef: args.toolRef })
        if (current?.targetJson !== snapshot.targetJson) return false
        const principal = await ctx.runMutation(internal.capabilityCalls.resolveCallAgentAuthority, {
          principal: args.principal, toolRef: args.toolRef,
        })
        if (principal === null || principal.environment !== operation.runtimeEnvironment) return false
        if (args.planNode !== undefined) {
          if (args.callRef !== undefined) return false
          return await ctx.runQuery(internal.capabilityPlans.readNodeProbeAdmission, {
            ...args.planNode, principal: args.principal, toolRef: args.toolRef, input: args.input,
          })
        }
        if (args.callRef !== undefined) {
          if (principal.authorityMode !== 'approval_required') return false
          return await ctx.runQuery(internal.capabilityCalls.readX402UnpaidProbeAdmission, {
            callRef: args.callRef,
            toolRef: args.toolRef,
            principalId: args.principal.principalId,
            input: args.input,
          })
        }
        return principal.authorityMode === 'spending_policy' || principal.authorityMode === 'unrestricted_test_only' 
      },
    })
    if (result.kind !== 'observed') return result
    const recorded = await ctx.runMutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, {
      toolRef: args.toolRef, targetDigest: operation.targetDigest,
      requirementDigest: result.requirement.requirementDigest, observedAt: result.requirement.observedAt,
    })
    return recorded ? result : { kind: 'refused' as const, reason: 'inspection_not_recorded' }
  },
})

export const bindPersistedManagedRequirement = internalAction({
  args: { toolRef: v.string(), input: jsonObject },
  returns: liveRequirementResult,
  handler: async (ctx, args): Promise<Infer<typeof liveRequirementResult>> => {
    const snapshot = await ctx.runQuery(
      internal.capabilitySupplyCurrentTool.readManagedX402InspectionSnapshot,
      { toolRef: args.toolRef },
    )
    if (snapshot === null) return { kind: 'operation_not_found' as const }
    const operation = JSON.parse(snapshot.targetJson) as LiveX402InspectionTarget & { contract: CapabilityContract }
    try {
      if (openCapabilityDecisionModel(operation.contract).validateInput(args.input).kind !== 'valid') return { kind: 'refused' as const, reason: 'input_invalid' }
    } catch (cause) { return degradeBackend(cause, { kind: 'refused' as const, reason: 'input_invalid' }, { site: 'bindPersistedManagedRequirement', reason: 'invalid_response' }) }
    const bound = persistedManagedX402Requirement(operation, args.input, Date.now())
    if (bound.kind === 'not_required') return { kind: 'refused' as const, reason: 'tool_unsupported' }
    return bound
  },
})

export const probeApprovedManagedX402 = internalAction({
  args: {
    callRef: v.string(),
    toolRef: v.string(),
    input: jsonObject,
    principal: principalValue,
    expectedDigest: v.string(),
  },
  returns: v.union(
    v.object({ kind: v.literal('matched') }),
    v.object({ kind: v.literal('pending') }),
    v.object({ kind: v.literal('refused') }),
  ),
  handler: async (ctx, args): Promise<{ kind: 'matched' | 'pending' | 'refused' }> => {
    const slot: { kind: 'claimed' | 'matched' | 'pending' | 'refused' } = await ctx.runMutation(internal.capabilityCalls.beginX402UnpaidProbe, {
      callRef: args.callRef,
      expectedDigest: args.expectedDigest,
    })
    if (slot.kind === 'pending' || slot.kind === 'matched' || slot.kind === 'refused') return { kind: slot.kind }
    const live: { kind: string; requirement?: { requirementDigest: string } } = await ctx.runAction(inspectLiveX402RequirementRef, {
      toolRef: args.toolRef,
      input: args.input,
      principal: args.principal,
      callRef: args.callRef,
    })
    const matched = live.kind === 'observed' && live.requirement?.requirementDigest === args.expectedDigest
    await ctx.runMutation(internal.capabilityCalls.finishX402UnpaidProbe, {
      callRef: args.callRef,
      outcome: matched
        ? { kind: 'matched' as const, requirementDigest: args.expectedDigest }
        : { kind: 'refused' as const },
    })
    return matched ? { kind: 'matched' as const } : { kind: 'refused' as const }
  },
})
