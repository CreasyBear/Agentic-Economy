import { createFileRoute } from '@tanstack/react-router'

import { handleCallListGet } from '@/lib/server/call-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'

const routeContract = CALL_ROUTE_CONTRACT.list

export const Route = createFileRoute('/api/v1/calls')({
  server: {
    handlers: defineRouteHandlers({
      [routeContract.method]: ({ request }) => handleCallListGet(request),
    }),
  },
})
