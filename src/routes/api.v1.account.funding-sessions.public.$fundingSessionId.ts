import { createFileRoute } from '@tanstack/react-router'

import { publicFundingHandoffResponse, readPublicFundingHandoff } from '@/lib/server/funding-handoff-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { withHttpRateLimit } from '@/lib/server/rate-limit'

export const handlePublicFundingSessionRequest = (request: Request, fundingSessionId: string): Promise<Response> =>
  withHttpRateLimit(request, 'public-read', async () =>
    publicFundingHandoffResponse(await readPublicFundingHandoff(fundingSessionId)))

export const Route = createFileRoute('/api/v1/account/funding-sessions/public/$fundingSessionId')({
  server: {
    handlers: defineRouteHandlers<{ fundingSessionId: string }>({
      GET: ({ request, params }) => handlePublicFundingSessionRequest(request, params.fundingSessionId),
    }),
  },
})
