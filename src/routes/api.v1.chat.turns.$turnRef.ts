import { createFileRoute } from '@tanstack/react-router'

import { handleChatTurnResource } from '@/lib/server/chat-turn-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/chat/turns/$turnRef')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleChatTurnResource(request, params.turnRef),
      DELETE: ({ request, params }) => handleChatTurnResource(request, params.turnRef),
      POST: () => methodNotAllowed(['GET', 'DELETE']),
      PUT: () => methodNotAllowed(['GET', 'DELETE']),
      PATCH: () => methodNotAllowed(['GET', 'DELETE']),
      HEAD: () => methodNotAllowed(['GET', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['GET', 'DELETE']),
      TRACE: () => methodNotAllowed(['GET', 'DELETE']),
      CONNECT: () => methodNotAllowed(['GET', 'DELETE']),
    },
  },
})
