import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionAllowPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      POST: ({ request, params }) => (
        handleAgentCustomerRequestRepeatPermissionAllowPost(request, params.requestRef)
      ),
    },
  },
})
