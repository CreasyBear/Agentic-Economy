import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionWithdrawPost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions/$permissionRef/withdrawal')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleAgentCustomerRequestRepeatPermissionWithdrawPost(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
