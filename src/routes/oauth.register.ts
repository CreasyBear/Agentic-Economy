import { createFileRoute } from '@tanstack/react-router'

import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleOAuthRegisterPost } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/oauth/register')({
  server: { handlers: { POST: ({ request }) => handleOAuthRegisterPost(request, { store: createConvexCustomerRequestAgentOAuthStore() }) } },
})
