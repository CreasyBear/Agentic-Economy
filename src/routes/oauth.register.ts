import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthRegisterPost } from '@/lib/server/customer-request-agent-oauth-api'
const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/register')({
  server: { handlers: { POST: ({ request }) => handleOAuthRegisterPost(request, { store: createConvexCustomerRequestAgentOAuthStore(request), rateLimit: admitOAuth }) } },
})
