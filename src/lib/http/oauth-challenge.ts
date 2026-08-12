import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import {
  MARKET_OPERATIONS_INVOKE_SCOPE,
} from '@/modules/agent-access/contract'
import {
  CUSTOMER_REQUEST_AGENT_BEARER_METHOD,
  CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'

export const AGENT_ACCESS_OAUTH_SCOPES = Object.freeze([
  MARKET_OPERATIONS_INVOKE_SCOPE,
  ...CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
])

export function bearerChallenge(
  canonicalBaseUrl: string,
  requiredScope: string = MARKET_OPERATIONS_INVOKE_SCOPE,
): string {
  const metadata = `${trimTrailingSlashes(canonicalBaseUrl)}/.well-known/oauth-protected-resource`
  return `Bearer resource_metadata="${metadata}", scope="${requiredScope}"`
}

export function bearerModeChallenge(canonicalBaseUrl: string, requiredMode: CustomerRequestAuthorityMode): string {
  return bearerChallenge(canonicalBaseUrl, customerRequestScopeForMode(requiredMode))
}

export function oauthProtectedResourceMetadata(canonicalBaseUrl: string): Readonly<{
  resource: string
  authorization_servers: readonly string[]
  bearer_methods_supported: readonly [typeof CUSTOMER_REQUEST_AGENT_BEARER_METHOD]
  scopes_supported: typeof AGENT_ACCESS_OAUTH_SCOPES
}> {
  const base = trimTrailingSlashes(canonicalBaseUrl)
  return {
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: [CUSTOMER_REQUEST_AGENT_BEARER_METHOD],
    scopes_supported: AGENT_ACCESS_OAUTH_SCOPES,
  }
}

function challengeHeaders(
  canonicalBaseUrl: string,
  requiredScope: string = MARKET_OPERATIONS_INVOKE_SCOPE,
): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Authorization',
    'WWW-Authenticate': bearerChallenge(canonicalBaseUrl, requiredScope),
  })
  return headers
}

