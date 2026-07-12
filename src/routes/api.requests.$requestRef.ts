import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'

export const Route = createFileRoute('/api/requests/$requestRef')({
  server: { handlers: { GET: ({ params }) => handleCustomerRequestGet(params.requestRef) } },
})
