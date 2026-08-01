import { describe, expect, it } from 'vitest'

import {
  oauthAuthorizationServerResponse,
  oauthProtectedResourceResponse,
} from '@/lib/server/customer-request-agent-oauth-api'

describe('OAuth metadata surfaces', () => {
  it('publishes only AE implemented grant endpoints and mode scopes', async () => {
    const request = new Request('https://local.example/.well-known/oauth-protected-resource')
    const protectedResource = await oauthProtectedResourceResponse(request).json()
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
    const authorizationServer = await oauthAuthorizationServerResponse(request).json()
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
})
