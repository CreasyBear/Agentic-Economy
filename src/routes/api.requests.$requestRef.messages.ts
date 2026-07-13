import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestMessagePost } from '@/lib/server/customer-request-messages-api'

export const Route = createFileRoute('/api/requests/$requestRef/messages')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestMessagePost(request, params.requestRef) } },
})
