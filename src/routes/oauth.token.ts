import { createFileRoute } from '@tanstack/react-router'

import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthTokenPost } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/oauth/token')({
  server: { handlers: { POST: ({ request }) => handleOAuthTokenPost(request, { store: createConvexCustomerRequestAgentOAuthStore() }) } },
})
