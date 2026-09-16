import { createFileRoute } from '@tanstack/react-router'

import { handleAgentAccountGet } from '@/lib/server/agent-account-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'

const routeContract = AGENT_ACCOUNT_SELF_ROUTE_CONTRACT

export const Route = createFileRoute('/api/v1/account')({
  server: {
    handlers: defineRouteHandlers({
      [routeContract.method]: ({ request }) => handleAgentAccountGet(request),
    }),
  },
})
