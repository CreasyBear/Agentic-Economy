import { createFileRoute } from '@tanstack/react-router'

import { handleAgentAccountActionPost } from '@/lib/server/agent-account-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/account/activity')({
  server: {
    handlers: postOnlyRoute((request) => handleAgentAccountActionPost(request, 'activity')),
  },
})
