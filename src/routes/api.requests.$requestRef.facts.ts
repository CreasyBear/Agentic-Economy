import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestFactsPost } from '@/lib/server/customer-request-browser-api'

export const Route = createFileRoute('/api/requests/$requestRef/facts')({
  server: { handlers: { POST: ({ request, params }) => handleBrowserCustomerRequestFactsPost(request, params.requestRef) } },
})
