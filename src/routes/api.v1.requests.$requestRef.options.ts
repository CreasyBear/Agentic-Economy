import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerOptionsPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/options')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerOptionsPost(request, params.requestRef) } },
})
