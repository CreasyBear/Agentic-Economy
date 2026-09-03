import { createFileRoute } from '@tanstack/react-router'

import { handleFundingHandoffAction } from '@/lib/server/funding-handoff-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/account/funding-sessions/$fundingSessionId')({
  server: { handlers: {
    GET: ({ request, params }) => handleFundingHandoffAction(request, 'status', params.fundingSessionId),
    POST: () => methodNotAllowed(['GET']),
  } },
})
