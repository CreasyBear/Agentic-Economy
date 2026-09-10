import { createFileRoute } from '@tanstack/react-router'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/supply/calls')({
  server: { handlers: {
    POST: ({ request }) => handleSupplyActionPost(request, 'calls'),
    GET: () => methodNotAllowed(['POST']),
    PUT: () => methodNotAllowed(['POST']),
    PATCH: () => methodNotAllowed(['POST']),
    DELETE: () => methodNotAllowed(['POST']),
  } },
})
