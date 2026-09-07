export const MARKET_TOOLS_CALL_SCOPE = 'market_tools:call' as const
export const MARKET_SUPPLY_MANAGE_SCOPE = 'market_supply:manage' as const
export const CUSTOMER_REQUEST_AGENT_SCOPE = 'customer_requests:create' as const
export const CUSTOMER_REQUEST_READ_ONLY_SCOPE = 'customer_requests:read_only' as const
export const CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE = 'customer_requests:approval_required' as const
export const CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE = 'customer_requests:spending_policy' as const
export const CUSTOMER_REQUEST_UNRESTRICTED_TEST_ONLY_SCOPE = 'customer_requests:unrestricted_test_only' as const
export const AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST = Object.freeze({
  client_name: 'Agentic Economy CLI',
  redirect_uris: Object.freeze(['http://127.0.0.1/callback'] as const),
  grant_types: Object.freeze(['urn:ietf:params:oauth:grant-type:device_code'] as const),
  response_types: Object.freeze([] as const),
  token_endpoint_auth_method: 'none' as const,
  scope: `${MARKET_TOOLS_CALL_SCOPE} ${CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE}`,
})
export const AGENT_ACCESS_AUTHORITY_MODE_VALUES = ['read_only', 'approval_required', 'spending_policy', 'unrestricted_test_only'] as const
export type AgentAccessAuthorityMode = typeof AGENT_ACCESS_AUTHORITY_MODE_VALUES[number]
export const CUSTOMER_REQUEST_STANDING_AUTHORITY_SCOPE = 'customer_requests:standing_authority' as const

const AUTHORITY_MODE_RANK: Readonly<Record<AgentAccessAuthorityMode, number>> = {
  read_only: 0,
  approval_required: 1,
  spending_policy: 2,
  unrestricted_test_only: 3,
}

const AUTHORITY_MODE_SCOPES: Readonly<Record<AgentAccessAuthorityMode, string>> = {
  read_only: CUSTOMER_REQUEST_READ_ONLY_SCOPE,
  approval_required: CUSTOMER_REQUEST_APPROVAL_REQUIRED_SCOPE,
  spending_policy: CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  unrestricted_test_only: CUSTOMER_REQUEST_UNRESTRICTED_TEST_ONLY_SCOPE,
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
    if (scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE) || scopes.includes(MARKET_TOOLS_CALL_SCOPE)) return mode
    return undefined
  }
  if (scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    && !scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)
    && modeScopes.length === 0) {
    return 'spending_policy'
  }
  if (scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)) {
    return options.allowCustomerDefault === true ? 'read_only' : undefined
  }
  return options.allowMarketOnly !== false && scopes.includes(MARKET_TOOLS_CALL_SCOPE)
    ? 'read_only'
    : undefined
}

export function agentAuthorityScopeForMode(mode: AgentAccessAuthorityMode): string {
  return AUTHORITY_MODE_SCOPES[mode]
}

export function agentAuthorityModeAllows(granted: AgentAccessAuthorityMode, required: AgentAccessAuthorityMode): boolean {
  return AUTHORITY_MODE_RANK[granted] >= AUTHORITY_MODE_RANK[required]
}
