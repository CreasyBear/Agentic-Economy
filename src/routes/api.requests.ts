import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'

export const Route = createFileRoute('/api/requests')({
  server: { handlers: { POST: ({ request }) => handleCustomerRequestPost(request) } },
})
