import type { ActionContext, ActionSurface } from '@/modules/common/action'

import type {
  HarnessApprovalDecision,
  HarnessToolDefinition,
} from './harness.schema'
import {
  resolveHarnessApprovalPolicy,
  type HarnessApprovalMode,
  type HarnessApprovalOverrideMap,
} from './approval-policy'

export type HarnessApprovalInput = {
  tool: HarnessToolDefinition
  context?: ActionContext
  surface?: ActionSurface
  mode: HarnessApprovalMode
  overrides?: HarnessApprovalOverrideMap
}

export function resolveHarnessApproval(input: HarnessApprovalInput): HarnessApprovalDecision {
  const resolution = resolveHarnessApprovalPolicy({
    tool: input.tool,
    mode: input.mode,
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.surface === undefined ? {} : { surface: input.surface }),
    ...(input.overrides === undefined ? {} : { overrides: input.overrides }),
  })

  return {
    policy: resolution.policy,
    tier: resolution.tier,
    reason: resolution.reason,
  }
}

