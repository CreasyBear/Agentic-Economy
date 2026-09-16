import { createFileRoute } from '@tanstack/react-router'

import { handleFundingHandoffAction } from '@/lib/server/funding-handoff-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/account/funding-sessions/$fundingSessionId')({
  server: {
    handlers: defineRouteHandlers<{ fundingSessionId: string }>({
      GET: ({ request, params }) => handleFundingHandoffAction(request, 'status', params.fundingSessionId),
    }),
  },
})
