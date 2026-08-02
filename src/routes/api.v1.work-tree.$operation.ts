import { createFileRoute } from '@tanstack/react-router'

import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'

export const Route = createFileRoute('/api/v1/work-tree/$operation')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleWorkTreeAgentAction(request, params.operation),
    },
  },
})
