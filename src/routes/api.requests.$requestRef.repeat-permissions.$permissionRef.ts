import { createFileRoute } from '@tanstack/react-router'

import { handleCustomerRequestRepeatPermissionGet } from '@/lib/server/customer-request-repeat-permission-api'

export const Route = createFileRoute('/api/requests/$requestRef/repeat-permissions/$permissionRef')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleCustomerRequestRepeatPermissionGet(
        request,
        params.requestRef,
        params.permissionRef,
      ),
    },
  },
})
