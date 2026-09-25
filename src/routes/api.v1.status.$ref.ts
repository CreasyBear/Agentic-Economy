import { createFileRoute } from '@tanstack/react-router'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'
import { handleJourneyStatusGet } from '@/lib/server/journey-status-api'

export const Route = createFileRoute('/api/v1/status/$ref')({
  server: {
    handlers: defineRouteHandlers<{ ref: string }>({
      GET: ({ request, params }) => handleJourneyStatusGet(request, params.ref),
    }),
  },
})
