import { createFileRoute } from '@tanstack/react-router'

import { handleCallStatusGet } from '@/lib/server/call-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.status

export const Route = createFileRoute('/api/v1/calls/$callRef')({
  server: {
    handlers: defineRouteHandlers<{ callRef: string }>({
      [routeContract.method]: ({ request, params }) => handleCallStatusGet(request, params.callRef),
    }),
  },
})
