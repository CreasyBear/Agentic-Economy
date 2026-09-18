import { createFileRoute } from '@tanstack/react-router'

import { handleCallCancelPost } from '@/lib/server/call-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.cancel

export const Route = createFileRoute('/api/v1/calls/$callRef/cancel')({
  server: {
    handlers: defineRouteHandlers<{ callRef: string }>({
      [routeContract.method]: ({ request, params }) => handleCallCancelPost(request, params.callRef),
    }),
  },
})
