import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRunPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/run')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestRunPost(request, params.requestRef) } },
})
