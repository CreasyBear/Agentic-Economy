import { createFileRoute } from '@tanstack/react-router'

import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthAuthorizeGet, handleOAuthConsentPost } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/oauth/authorize')({
  server: { handlers: {
    GET: ({ request }) => handleOAuthAuthorizeGet(request, { store: createConvexCustomerRequestAgentOAuthStore() }),
    POST: ({ request }) => handleOAuthConsentPost(request, { store: createConvexCustomerRequestAgentOAuthStore() }),
  } },
})
