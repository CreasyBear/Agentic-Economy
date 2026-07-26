import { createFileRoute } from '@tanstack/react-router'

import { handleBusinessToolPrepare } from '@/lib/server/business-tool-api'

export const Route = createFileRoute('/$slug/tools/$toolId/prepare')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBusinessToolPrepare(request, params.slug, params.toolId),
    },
  },
})
