import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests')({
  server: { handlers: { POST: ({ request }) => handleAgentCustomerRequestPost(request) } },
})
