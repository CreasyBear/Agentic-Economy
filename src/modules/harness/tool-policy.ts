import type { ActionContext, ActionSurface } from '@/modules/common/action'

import type {
  HarnessApprovalDecision,
  HarnessToolDefinition,
} from './harness.schema'

export type HarnessApprovalInput = {
  tool: HarnessToolDefinition
  context?: ActionContext
  surface?: ActionSurface
  allowWrites?: boolean
}

export function resolveHarnessApproval(input: HarnessApprovalInput): HarnessApprovalDecision {
  const { tool } = input

  if (tool.approval === 'deny') {
    return { policy: 'deny', tier: tool.tier, reason: 'tool_policy_denied' }
  }

  if (input.surface !== undefined && !tool.surfaces.includes(input.surface)) {
    return { policy: 'deny', tier: tool.tier, reason: 'surface_not_allowed' }
  }

  if (tool.tier === 'exec') {
    return { policy: 'deny', tier: tool.tier, reason: 'exec_tools_not_supported' }
  }

  if (tool.tier === 'read') {
    return { policy: 'allow', tier: tool.tier, reason: 'read_tool_auto_allowed' }
  }

  if (input.allowWrites !== true) {
    return { policy: 'deny', tier: tool.tier, reason: 'write_not_allowed' }
  }

  if (input.context?.sourceWriteRequest === undefined) {
    return { policy: 'prompt', tier: tool.tier, reason: 'write_requires_source_admission' }
  }

  return { policy: 'allow', tier: tool.tier, reason: 'write_source_admitted' }
}
