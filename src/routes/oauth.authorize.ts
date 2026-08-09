import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthAuthorizeGet, handleOAuthConsentPost, oauthAuthorizationUnavailableResponse } from '@/lib/server/customer-request-agent-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/authorize')({
  server: { handlers: {
    GET: ({ request }) => {
      try {
        const store = createConvexCustomerRequestAgentOAuthStore(request)
        return handleOAuthAuthorizeGet(request, { store, rateLimit: admitOAuth })
      } catch {
        return oauthAuthorizationUnavailableResponse()
      }
    },
    POST: ({ request }) => handleOAuthConsentPost(request, { store: createConvexCustomerRequestAgentOAuthStore(request), rateLimit: admitOAuth }),
    PUT: () => methodNotAllowed(['GET', 'POST']),
    PATCH: () => methodNotAllowed(['GET', 'POST']),
    DELETE: () => methodNotAllowed(['GET', 'POST']),
    HEAD: () => methodNotAllowed(['GET', 'POST']),
    OPTIONS: () => methodNotAllowed(['GET', 'POST']),
    TRACE: () => methodNotAllowed(['GET', 'POST']),
    CONNECT: () => methodNotAllowed(['GET', 'POST']),
  } },
})
