import { createFileRoute } from '@tanstack/react-router'

import { handleBrowserCustomerRequestPost } from '@/lib/server/customer-request-browser-api'

export const Route = createFileRoute('/api/requests')({
  server: { handlers: { POST: ({ request }) => handleBrowserCustomerRequestPost(request) } },
})
