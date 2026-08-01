import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'

export function bearerChallenge(canonicalBaseUrl: string, requiredScope: string = CUSTOMER_REQUEST_AGENT_SCOPE): string {
  const metadata = `${canonicalBaseUrl.replace(/\/+$/u, '')}/.well-known/oauth-protected-resource`
  return `Bearer resource_metadata="${metadata}", scope="${requiredScope}"`
}

export function bearerModeChallenge(canonicalBaseUrl: string, requiredMode: CustomerRequestAuthorityMode): string {
  return bearerChallenge(canonicalBaseUrl, customerRequestScopeForMode(requiredMode))
}

export function oauthProtectedResourceMetadata(canonicalBaseUrl: string): Readonly<{
  resource: string
  authorization_servers: readonly string[]
  bearer_methods_supported: readonly ['header']
  scopes_supported: readonly string[]
}> {
  const base = canonicalBaseUrl.replace(/\/+$/u, '')
  return {
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: [CUSTOMER_REQUEST_AGENT_SCOPE, ...CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.map(customerRequestScopeForMode)],
  }
}

export function challengeHeaders(canonicalBaseUrl: string, requiredScope: string = CUSTOMER_REQUEST_AGENT_SCOPE): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Authorization',
    'WWW-Authenticate': bearerChallenge(canonicalBaseUrl, requiredScope),
  })
  return headers
}
