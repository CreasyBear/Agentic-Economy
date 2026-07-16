import { createFileRoute } from '@tanstack/react-router'

import {
  handleAgentCustomerRequestRepeatPermissionAllowPost,
  handleAgentCustomerRequestRepeatPermissionsGet,
} from '@/lib/server/customer-request-agent-api'

export const Route = createFileRoute('/api/v1/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      GET: ({ request, params }) => (
        handleAgentCustomerRequestRepeatPermissionsGet(request, params.requestRef)
      ),
      POST: ({ request, params }) => (
        handleAgentCustomerRequestRepeatPermissionAllowPost(request, params.requestRef)
      ),
    },
  },
})
