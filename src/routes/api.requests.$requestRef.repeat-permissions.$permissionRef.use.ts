import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRepeatPermissionUsePost } from '@/lib/server/customer-request-repeat-permission-api'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions/$permissionRef/use')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleCustomerRequestRepeatPermissionUsePost(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
