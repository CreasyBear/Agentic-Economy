import { createFileRoute } from '@tanstack/react-router'

import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/work-tree/$operation')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleWorkTreeAgentAction(request, params.operation),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})
