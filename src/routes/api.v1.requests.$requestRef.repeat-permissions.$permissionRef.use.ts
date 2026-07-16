import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionUsePost } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions/$permissionRef/use')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleAgentCustomerRequestRepeatPermissionUsePost(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
