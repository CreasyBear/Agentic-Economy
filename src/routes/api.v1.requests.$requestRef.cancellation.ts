import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestCancelPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/cancellation')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestCancelPost(request, params.requestRef) } },
})
