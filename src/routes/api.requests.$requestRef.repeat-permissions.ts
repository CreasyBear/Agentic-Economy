import { createFileRoute } from '@tanstack/react-router'

import {
  handleCustomerRequestConnectedAssistantsGet,
  handleCustomerRequestRepeatPermissionAllowPost,
} from '@/lib/server/customer-request-repeat-permission-api'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleCustomerRequestConnectedAssistantsGet(request, params.requestRef),
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionAllowPost(request, params.requestRef),
    },
  },
})
