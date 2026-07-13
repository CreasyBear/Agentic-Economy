import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestAuthorizationPost } from '@/lib/server/customer-request-authorization-api'

export const Route = createFileRoute('/api/requests/$requestRef/authorization')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestAuthorizationPost(request, params.requestRef) } },
})
