import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import { AGENT_ACCESS_OAUTH_OFFLINE_SCOPE } from '@/modules/agent-access/oauth-state'

export const AGENT_ACCESS_BEARER_METHOD = 'header' as const
export const AGENT_ACCESS_OAUTH_SCOPES = Object.freeze([
  MARKET_OPERATIONS_INVOKE_SCOPE,
  ...AGENT_ACCESS_AUTHORITY_MODE_VALUES.map(agentAuthorityScopeForMode),
])
export const AGENT_ACCESS_OAUTH_AUTHORIZATION_SCOPES = Object.freeze([
  ...AGENT_ACCESS_OAUTH_SCOPES,
  AGENT_ACCESS_OAUTH_OFFLINE_SCOPE,
])
export const AGENT_ACCESS_DEFAULT_BUYER_OAUTH_SCOPE = `${MARKET_OPERATIONS_INVOKE_SCOPE} ${agentAuthorityScopeForMode('approve_each')} ${AGENT_ACCESS_OAUTH_OFFLINE_SCOPE}`

export function bearerChallenge(
  canonicalBaseUrl: string,
  requiredScope: string = AGENT_ACCESS_DEFAULT_BUYER_OAUTH_SCOPE,
): string {
  const metadata = `${trimTrailingSlashes(canonicalBaseUrl)}/.well-known/oauth-protected-resource`
  return `Bearer resource_metadata="${metadata}", scope="${requiredScope}"`
}

export function bearerModeChallenge(canonicalBaseUrl: string, requiredMode: AgentAccessAuthorityMode): string {
  return bearerChallenge(canonicalBaseUrl, `${MARKET_OPERATIONS_INVOKE_SCOPE} ${agentAuthorityScopeForMode(requiredMode)} ${AGENT_ACCESS_OAUTH_OFFLINE_SCOPE}`)
}

export function oauthProtectedResourceMetadata(canonicalBaseUrl: string): Readonly<{
  resource: string
  authorization_servers: readonly string[]
  bearer_methods_supported: readonly [typeof AGENT_ACCESS_BEARER_METHOD]
  scopes_supported: typeof AGENT_ACCESS_OAUTH_SCOPES
}> {
  const base = trimTrailingSlashes(canonicalBaseUrl)
  return {
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: [AGENT_ACCESS_BEARER_METHOD],
    scopes_supported: AGENT_ACCESS_OAUTH_SCOPES,
  }
}
