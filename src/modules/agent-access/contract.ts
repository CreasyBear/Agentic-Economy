export const MARKET_OPERATIONS_INVOKE_SCOPE = 'market_operations:invoke' as const
export const MARKET_SUPPLY_MANAGE_SCOPE = 'market_supply:manage' as const
export const CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create' as const
export const CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE = 'customer_requests:inspect_only' as const
export const CUSTOMER_REQUEST_APPROVE_EACH_SCOPE = 'customer_requests:approve_each' as const
export const CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE = 'customer_requests:bounded_mandate' as const
export const CUSTOMER_REQUEST_FULL_YOLO_SCOPE = 'customer_requests:full_yolo' as const
export const AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST = Object.freeze({
  client_name: 'Agentic Economy CLI',
  redirect_uris: Object.freeze(['http://127.0.0.1/callback'] as const),
  grant_types: Object.freeze(['urn:ietf:params:oauth:grant-type:device_code'] as const),
  response_types: Object.freeze([] as const),
  token_endpoint_auth_method: 'none' as const,
  scope: `${MARKET_OPERATIONS_INVOKE_SCOPE} ${CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE}`,
})
export const AGENT_ACCESS_AUTHORITY_MODE_VALUES = ['inspect_only', 'approve_each', 'bounded_mandate', 'full_yolo'] as const
export type AgentAccessAuthorityMode = typeof AGENT_ACCESS_AUTHORITY_MODE_VALUES[number]
export const CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE = 'customer_requests:standing_authority' as const

const AUTHORITY_MODE_RANK: Readonly<Record<AgentAccessAuthorityMode, number>> = {
  inspect_only: 0,
  approve_each: 1,
  bounded_mandate: 2,
  full_yolo: 3,
}

const AUTHORITY_MODE_SCOPES: Readonly<Record<AgentAccessAuthorityMode, string>> = {
  inspect_only: CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE,
  approve_each: CUSTOMER_REQUEST_APPROVE_EACH_SCOPE,
  bounded_mandate: CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE,
  full_yolo: CUSTOMER_REQUEST_FULL_YOLO_SCOPE,
}

export function agentAuthorityModeForScopes(
  scopes: readonly string[],
  options: Readonly<{ allowMarketOnly?: boolean; allowCustomerDefault?: boolean }> = {},
): AgentAccessAuthorityMode | undefined {
  const modeScopes = scopes.filter((scope) => AGENT_ACCESS_AUTHORITY_MODE_VALUES.some((mode) => AUTHORITY_MODE_SCOPES[mode] === scope))
  const unknownCustomerScope = scopes.some((scope) => scope.startsWith('customer_requests:')
    && scope !== CUSTOMER_REQUEST_AGENT_SCOPE && scope !== CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE
    && !AGENT_ACCESS_AUTHORITY_MODE_VALUES.some((mode) => AUTHORITY_MODE_SCOPES[mode] === scope))
  if (unknownCustomerScope || modeScopes.length > 1) return undefined
  if (modeScopes.length === 1) {
    const mode = AGENT_ACCESS_AUTHORITY_MODE_VALUES.find((candidate) => AUTHORITY_MODE_SCOPES[candidate] === modeScopes[0])
    if (mode === undefined) return undefined
    if (scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE) || scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)) return mode
    return undefined
  }
  if (scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    && !scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)
    && modeScopes.length === 0) {
    return 'bounded_mandate'
  }
  if (scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)) {
    return options.allowCustomerDefault === true ? 'inspect_only' : undefined
  }
  return options.allowMarketOnly !== false && scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
    ? 'inspect_only'
    : undefined
}

export function agentAuthorityScopeForMode(mode: AgentAccessAuthorityMode): string {
  return AUTHORITY_MODE_SCOPES[mode]
}

export function agentAuthorityModeAllows(granted: AgentAccessAuthorityMode, required: AgentAccessAuthorityMode): boolean {
  return AUTHORITY_MODE_RANK[granted] >= AUTHORITY_MODE_RANK[required]
}
