import { createFileRoute } from '@tanstack/react-router'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/v1/supply/status')({
  server: { handlers: {
    POST: ({ request }) => handleSupplyActionPost(request, 'status'),
    GET: () => methodNotAllowed(['POST']),
    PUT: () => methodNotAllowed(['POST']),
    PATCH: () => methodNotAllowed(['POST']),
    DELETE: () => methodNotAllowed(['POST']),
  } },
})
