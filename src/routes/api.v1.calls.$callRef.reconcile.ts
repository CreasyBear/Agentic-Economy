import { createFileRoute } from '@tanstack/react-router'

import { handleCallReconcilePost } from '@/lib/server/call-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.reconcile

export const Route = createFileRoute('/api/v1/calls/$callRef/reconcile')({
  server: {
    handlers: defineRouteHandlers<{ callRef: string }>({
      [routeContract.method]: ({ request, params }) => handleCallReconcilePost(request, params.callRef),
    }),
  },
})
