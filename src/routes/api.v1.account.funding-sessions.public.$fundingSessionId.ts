import { createFileRoute } from '@tanstack/react-router'

import { publicFundingHandoffResponse, readPublicFundingHandoff } from '@/lib/server/funding-handoff-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/account/funding-sessions/public/$fundingSessionId')({
  server: {
    handlers: defineRouteHandlers<{ fundingSessionId: string }>({
      GET: async ({ params }) => publicFundingHandoffResponse(await readPublicFundingHandoff(params.fundingSessionId)),
    }),
  },
})
