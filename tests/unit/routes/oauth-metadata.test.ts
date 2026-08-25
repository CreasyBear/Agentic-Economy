import { describe, expect, it, vi } from 'vitest'
import { AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE, MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import {
  AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_POLL_INTERVAL_SECONDS,
  AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
} from '@/modules/agent-access/oauth-state'

import {
  oauthAuthorizationServerResponse,
  oauthChallengeResponse,
  oauthProtectedResourceResponse,
} from '@/lib/server/agent-access-oauth-api'

describe('OAuth metadata surfaces', () => {
  it('publishes only AE implemented grant endpoints and mode scopes', async () => {
    const request = new Request('https://local.example/.well-known/oauth-protected-resource')
    const canonicalBaseUrl = 'https://local.example'
    const protectedResource = await oauthProtectedResourceResponse(request, canonicalBaseUrl).json()
    expect(protectedResource).toEqual({
      resource: 'https://local.example',
      authorization_servers: ['https://local.example'],
      bearer_methods_supported: ['header'],
      scopes_supported: [
        'market_operations:invoke',
        'customer_requests:inspect_only',
        'customer_requests:approve_each',
        'customer_requests:bounded_mandate',
        'customer_requests:full_yolo',
      ],
    })
    const authorizationServer = await oauthAuthorizationServerResponse(request, canonicalBaseUrl).json()
    expect(authorizationServer).toMatchObject({
      issuer: 'https://local.example',
      authorization_endpoint: 'https://local.example/oauth/authorize',
      token_endpoint: 'https://local.example/oauth/token',
      registration_endpoint: 'https://local.example/oauth/register',
      device_authorization_endpoint: 'https://local.example/oauth/device_authorization',
      response_types_supported: ['code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    })
    expect(authorizationServer).not.toHaveProperty('refresh_token_endpoint')
  })

  it('uses configured canonical origin for metadata and bearer challenges instead of the request host', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.agentic.test/')
    try {
      const request = new Request('https://spoofed.agentic.test/.well-known/oauth-protected-resource')
      const protectedResource = await oauthProtectedResourceResponse(request).json()
      const authorizationServer = await oauthAuthorizationServerResponse(request).json()
      const challenge = oauthChallengeResponse(request)

      expect(protectedResource).toMatchObject({
        resource: 'https://canonical.agentic.test',
        authorization_servers: ['https://canonical.agentic.test'],
      })
      expect(authorizationServer).toMatchObject({
        issuer: 'https://canonical.agentic.test',
        authorization_endpoint: 'https://canonical.agentic.test/oauth/authorize',
      })
      expect(challenge.headers.get('WWW-Authenticate')).toBe(
        'Bearer resource_metadata="https://canonical.agentic.test/.well-known/oauth-protected-resource", scope="market_operations:invoke"'
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps the device registration request aligned with OAuth metadata and polling constants', async () => {
    const request = new Request('https://local.example/.well-known/oauth-authorization-server')
    const metadata = await oauthAuthorizationServerResponse(request, 'https://local.example').json()

    expect(metadata).toMatchObject({
      grant_types_supported: [...AGENT_ACCESS_OAUTH_GRANT_TYPES],
      response_types_supported: [...AGENT_ACCESS_OAUTH_RESPONSE_TYPES],
      token_endpoint_auth_methods_supported: [...AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS],
      code_challenge_methods_supported: [...AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS],
    })
    expect(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.grant_types).toEqual([
      AGENT_ACCESS_OAUTH_GRANT_TYPES[1],
    ])
    expect(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.response_types).toEqual([])
    expect(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.token_endpoint_auth_method)
      .toBe(AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS[0])
    expect(AGENT_ACCESS_OAUTH_DEVICE_CLIENT_REGISTRATION_REQUEST.scope).toBe(
      `${MARKET_OPERATIONS_INVOKE_SCOPE} ${CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE}`,
    )
    expect(AGENT_ACCESS_POLL_INTERVAL_SECONDS).toBe(5)
  })
})
