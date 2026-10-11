import { createFileRoute } from '@tanstack/react-router'

import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { handlePersonalDataExportRequest } from '@/lib/server/personal-data-export.functions'

export const Route = createFileRoute('/api/owner/data-export')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handlePersonalDataExportRequest(request),
      HEAD: ({ request }) => handlePersonalDataExportRequest(request, true),
    }),
  },
})
