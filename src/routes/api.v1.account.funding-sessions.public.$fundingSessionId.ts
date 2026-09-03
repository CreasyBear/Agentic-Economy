import { createFileRoute } from '@tanstack/react-router'

import { publicFundingHandoffResponse, readPublicFundingHandoff } from '@/lib/server/funding-handoff-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/account/funding-sessions/public/$fundingSessionId')({
  server: { handlers: {
    GET: async ({ params }) => publicFundingHandoffResponse(await readPublicFundingHandoff(params.fundingSessionId)),
    POST: () => methodNotAllowed(['GET']),
  } },
})
