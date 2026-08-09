import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import {
  CUSTOMER_REQUEST_AGENT_BEARER_METHOD,
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'

export function bearerChallenge(
  canonicalBaseUrl: string,
  requiredScope: string = CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope,
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
  scopes_supported: typeof CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES
}> {
  const base = trimTrailingSlashes(canonicalBaseUrl)
  return {
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: [CUSTOMER_REQUEST_AGENT_BEARER_METHOD],
    scopes_supported: CUSTOMER_REQUEST_AGENT_REQUIRED_SCOPES,
  }
}

function challengeHeaders(
  canonicalBaseUrl: string,
  requiredScope: string = CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope,
): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Authorization',
    'WWW-Authenticate': bearerChallenge(canonicalBaseUrl, requiredScope),
  })
  return headers
}
