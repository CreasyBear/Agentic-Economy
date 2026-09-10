import { createFileRoute } from '@tanstack/react-router'

import { handleFundingHandoffAction } from '@/lib/server/funding-handoff-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/account/funding-sessions')({
  server: { handlers: {
    POST: ({ request }) => handleFundingHandoffAction(request, 'create'),
    GET: () => methodNotAllowed(['POST']),
  } },
})
