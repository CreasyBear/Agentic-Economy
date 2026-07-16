import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestRepeatPermissionGet } from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions/$permissionRef')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleAgentCustomerRequestRepeatPermissionGet(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
