import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestFactsPost } from '@/lib/server/customer-request-facts-api'

export const Route = createFileRoute('/api/requests/$requestRef/facts')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerRequestFactsPost(request, params.requestRef) } },
})
