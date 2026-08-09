import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { handleBusinessToolPrepare } from '@/lib/server/business-tool-api'

export const Route = createFileRoute('/$slug/tools/$toolId/prepare')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBusinessToolPrepare(request, params.slug, params.toolId),
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
