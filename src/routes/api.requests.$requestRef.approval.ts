import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestApprovalPost } from '@/lib/server/customer-request-approval-api'

export const Route = createFileRoute('/api/requests/$requestRef/approval')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestApprovalPost(request, params.requestRef),
    },
  },
})
