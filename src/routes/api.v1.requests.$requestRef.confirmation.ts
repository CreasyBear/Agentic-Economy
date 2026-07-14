import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestConfirmationPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/confirmation')({
  server: { handlers: { POST: ({ request, params }) => handleAgentCustomerRequestConfirmationPost(request, params.requestRef) } },
})
