import { createFileRoute } from '@tanstack/react-router'

import { handleFundingHandoffAction } from '@/lib/server/funding-handoff-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/account/funding-sessions')({
  server: {
    handlers: postOnlyRoute((request) => handleFundingHandoffAction(request, 'create')),
  },
})
