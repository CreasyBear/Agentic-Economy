import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthAuthorizeGet, handleOAuthConsentPost } from '@/lib/server/customer-request-agent-oauth-api'
const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/authorize')({
  server: { handlers: {
    GET: ({ request }) => handleOAuthAuthorizeGet(request, { store: createConvexCustomerRequestAgentOAuthStore(request), rateLimit: admitOAuth }),
    POST: ({ request }) => handleOAuthConsentPost(request, { store: createConvexCustomerRequestAgentOAuthStore(request), rateLimit: admitOAuth }),
  } },
})
