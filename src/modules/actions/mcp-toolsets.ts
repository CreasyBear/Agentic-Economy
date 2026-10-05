import type { AnyAction } from '@/modules/common/action'

/** MCP exposes workflows, never one tool per published Operation. */
export const MCP_TOOLSETS = {
  discover: ['registry.tools.search', 'registry.tools.describe', 'registry.tools.compare', 'marketDemand.record', 'marketDemand.list', 'marketDemand.status', 'marketDemand.withdraw', 'market.savedTools.list', 'market.savedTools.save', 'market.savedTools.remove'],
  buy: ['tool.quote', 'tool.plan.quote', 'tool.call', 'tool.procure', 'journey.status', 'call.status', 'call.cancel', 'call.reconcile'],
  account: ['agentAccess.whoami', 'agentAccess.balance', 'agentAccess.activity', 'call.list', 'funding.handoff.config', 'funding.handoff.create', 'funding.handoff.status'],
  provider: [
    'supply.calls', 'supply.connection.connect', 'supply.connection.detail',
    'supply.connection.list', 'supply.connection.reconnect', 'supply.connection.revoke',
    'supply.earnings', 'supply.offboarding.status', 'supply.publish',
    'supply.recheck', 'supply.republish', 'supply.source.preview',
    'supply.status', 'supply.tools.list', 'supply.withdraw',
  ],
} as const

export type McpToolsetRole = keyof typeof MCP_TOOLSETS

export function mcpToolsetRole(action: AnyAction): McpToolsetRole | undefined {
  if (!action.surfaces.includes('mcp')) return undefined
  for (const role of Object.keys(MCP_TOOLSETS) as McpToolsetRole[]) {
    if ((MCP_TOOLSETS[role] as readonly string[]).includes(action.id)) return role
  }
  return undefined
}

/** Listing and dispatch share one role gate; authority is still rechecked by each action. */
export function mcpToolsetAdmitted(
  action: AnyAction,
  access: Readonly<{ scopes: readonly string[]; authenticated: boolean; readOnly: boolean }>,
): boolean {
  const role = mcpToolsetRole(action)
  if (role === undefined) return false
  if (!access.authenticated) return role === 'discover' && action.readOnly && action.credentialAdmission === undefined
  if (access.readOnly && (role === 'buy' || role === 'provider' || !action.readOnly)) return false
  if (role === 'provider' && !access.scopes.includes('market_supply:manage')) return false
  if (role === 'buy' && !access.scopes.includes('market_tools:call')) return false
  const admission = action.credentialAdmission
  return admission === undefined
    ? action.readOnly
    : (admission.anyScopes ?? [admission.scope]).some((scope) => access.scopes.includes(scope))
}
