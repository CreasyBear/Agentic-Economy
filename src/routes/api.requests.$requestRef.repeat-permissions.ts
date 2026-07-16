import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRepeatPermissionAllowPost } from '@/lib/server/customer-request-repeat-permission-api'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionAllowPost(request, params.requestRef),
    },
  },
})
