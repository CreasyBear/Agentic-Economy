import { createFileRoute } from '@tanstack/react-router'

import { createConvexCustomerRequestAgentOAuthStore } from '@/lib/server/customer-request-agent-oauth-store'
import { handleDeviceAuthorizationPost } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/oauth/device_authorization')({
  server: { handlers: { POST: ({ request }) => handleDeviceAuthorizationPost(request, { store: createConvexCustomerRequestAgentOAuthStore() }) } },
})
