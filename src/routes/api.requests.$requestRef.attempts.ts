import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestActionAttemptPost } from '@/lib/server/customer-request-action-attempt-api'

export const Route = createFileRoute('/api/requests/$requestRef/attempts')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestActionAttemptPost(request, params.requestRef),
    },
  },
})
