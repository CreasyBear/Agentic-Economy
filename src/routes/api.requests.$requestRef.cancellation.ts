import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestCancelPost } from '@/lib/server/customer-request-route-action-api'

export const Route = createFileRoute('/api/requests/$requestRef/cancellation')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestCancelPost(request, params.requestRef) } },
})
