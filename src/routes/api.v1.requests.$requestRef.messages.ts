import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestMessagePost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/messages')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestMessagePost(request, params.requestRef) } },
})
