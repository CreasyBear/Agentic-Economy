import type { ActionContext, ActionSurface } from '@/modules/common/action'

import type {
  HarnessApprovalDecision,
  HarnessToolDefinition,
} from './harness.schema'
import {
  resolveHarnessApprovalPolicy,
  sourceWriteDeclarationForTool,
  type HarnessApprovalMode,
  type HarnessApprovalOverrideMap,
} from './approval-policy'

export type HarnessApprovalInput = {
  tool: HarnessToolDefinition
  context?: ActionContext
  surface?: ActionSurface
  mode?: HarnessApprovalMode
  allowWrites?: boolean
  overrides?: HarnessApprovalOverrideMap
}

export function resolveHarnessApproval(input: HarnessApprovalInput): HarnessApprovalDecision {
  const resolution = resolveHarnessApprovalPolicy({
    tool: input.tool,
    mode: input.mode ?? legacyModeForInput(input),
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

function legacyModeForInput(input: HarnessApprovalInput): HarnessApprovalMode {
  if (input.allowWrites === true) {
    const declaration = sourceWriteDeclarationForTool(input.tool)
    const [declaredMode] = declaration?.allowedModes ?? []
    return declaredMode ?? 'public-qualified-write'
  }

  return 'public-read'
}
