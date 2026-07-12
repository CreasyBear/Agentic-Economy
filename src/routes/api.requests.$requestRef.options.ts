import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'

export const Route = createFileRoute('/api/requests/$requestRef/options')({
  server: { handlers: { POST: ({ request, params }) => handleCustomerOptionsPost(request, params.requestRef) } },
})
