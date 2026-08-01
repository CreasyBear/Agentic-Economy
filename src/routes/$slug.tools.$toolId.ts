import { createFileRoute } from '@tanstack/react-router'

import { handleBusinessToolInvoke } from '@/lib/server/business-tool-api'

export const Route = createFileRoute('/$slug/tools/$toolId')({
  server: {
    handlers: {
      POST: ({ request, params }) => handleBusinessToolInvoke(request, params.slug, params.toolId),
    },
  },
})
