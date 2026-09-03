import { createFileRoute } from '@tanstack/react-router'

import { handleFundingHandoffAction } from '@/lib/server/funding-handoff-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/account/funding/config')({
  server: { handlers: {
    GET: ({ request }) => handleFundingHandoffAction(request, 'config'),
    POST: () => methodNotAllowed(['GET']),
  } },
})
