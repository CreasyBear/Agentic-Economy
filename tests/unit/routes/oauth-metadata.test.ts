import { describe, expect, it, vi } from 'vitest'

import {
  oauthAuthorizationServerResponse,
  oauthChallengeResponse,
  oauthProtectedResourceResponse,
} from '@/lib/server/customer-request-agent-oauth-api'

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
        'customer_requests:create',
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
        'Bearer resource_metadata="https://canonical.agentic.test/.well-known/oauth-protected-resource", scope="customer_requests:create"'
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
