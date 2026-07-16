import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRepeatPermissionWithdrawPost } from '@/lib/server/customer-request-repeat-permission-api'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions/$permissionRef/withdrawal')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionWithdrawPost(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
