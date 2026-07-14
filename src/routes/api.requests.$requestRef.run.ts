import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRunPost } from '@/lib/server/customer-request-route-action-api'

export const Route = createFileRoute('/api/requests/$requestRef/run')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestRunPost(request, params.requestRef) } },
})
