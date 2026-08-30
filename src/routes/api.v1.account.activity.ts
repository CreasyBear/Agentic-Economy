import { createFileRoute } from '@tanstack/react-router'

import { handleAgentAccountActionPost } from '@/lib/server/agent-account-api'

export const Route = createFileRoute('/api/v1/account/activity')({
  server: { handlers: { POST: ({ request }) => handleAgentAccountActionPost(request, 'activity') } },
})
