import type { HarnessApprovalTool } from './approval-policy'
import { sourceWriteDeclarationForTool } from './approval-policy'

/**
 * Canonical map of agent-tool ids that may request write admission, and the
 * clearance scope each must present. Harness source-write declarations and
 * clearance admission both derive from this table — do not re-declare tool→scope
 * pairs in the quiet-door route or clearance allowlist.
 */
export const AGENT_TOOL_WRITE_SCOPES = {
  'inquiry.submit': 'public_inquiry',
  'businessAction.requestCapability': 'business_action_request',
} as const

export type AgentToolWriteToolId = keyof typeof AGENT_TOOL_WRITE_SCOPES
export type AgentToolWriteScope = (typeof AGENT_TOOL_WRITE_SCOPES)[AgentToolWriteToolId]

export function declaredAgentToolWriteScope(toolId: string): AgentToolWriteScope | undefined {
  if (!Object.hasOwn(AGENT_TOOL_WRITE_SCOPES, toolId)) {
    return undefined
  }
  return AGENT_TOOL_WRITE_SCOPES[toolId as AgentToolWriteToolId]
}

/**
 * Quiet-door write scope for a harness tool. Only `public_inquiry` is exposed on
 * the public quiet door today; other declared agent-tool scopes stay off this path.
 */
export function publicQuietAgentWriteScopeForTool(
  tool: HarnessApprovalTool,
): Extract<AgentToolWriteScope, 'public_inquiry'> | undefined {
  const declared = declaredAgentToolWriteScope(tool.id)
  if (declared !== 'public_inquiry') {
    return undefined
  }

  const declaration = sourceWriteDeclarationForTool(tool)
  if (declaration?.scope !== 'public_inquiry') {
    return undefined
  }
  if (!declaration.allowedModes.includes('public-qualified-write')) {
    return undefined
  }

  return 'public_inquiry'
}
