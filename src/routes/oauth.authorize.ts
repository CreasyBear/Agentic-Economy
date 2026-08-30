import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { createConvexAgentAccessOAuthStore } from '@/lib/server/agent-access-oauth-store'
import { handleOAuthAuthorizeGet, handleOAuthConsentPost, oauthAuthorizationUnavailableResponse } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/authorize')({
  server: { handlers: {
    GET: ({ request }) => {
      try {
        const store = createConvexAgentAccessOAuthStore(request, '')
        return handleOAuthAuthorizeGet(request, { store, rateLimit: admitOAuth })
      } catch (error) {
        console.error('[oauth.authorize] GET failed', sanitizeTelemetryError(error))
        return oauthAuthorizationUnavailableResponse()
      }
    },
    POST: async ({ request }) => {
      try {
        const body = await request.clone().text()
        return await handleOAuthConsentPost(request, { store: createConvexAgentAccessOAuthStore(request, body), rateLimit: admitOAuth })
      } catch (error) {
        console.error('[oauth.authorize] POST failed', sanitizeTelemetryError(error))
        return oauthAuthorizationUnavailableResponse()
      }
    },
    PUT: () => methodNotAllowed(['GET', 'POST']),
    PATCH: () => methodNotAllowed(['GET', 'POST']),
    DELETE: () => methodNotAllowed(['GET', 'POST']),
    HEAD: () => methodNotAllowed(['GET', 'POST']),
    OPTIONS: () => methodNotAllowed(['GET', 'POST']),
    TRACE: () => methodNotAllowed(['GET', 'POST']),
    CONNECT: () => methodNotAllowed(['GET', 'POST']),
  } },
})
