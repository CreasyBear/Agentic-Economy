import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestGet } from '@/lib/server/customer-request-browser-api'

export const Route = createFileRoute('/api/requests/$requestRef')({
  server: { handlers: { GET: ({ request, params }) => handleBrowserCustomerRequestGet(request, params.requestRef) } },
})
