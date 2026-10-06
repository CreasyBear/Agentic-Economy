import { createFileRoute } from '@tanstack/react-router'
import { handleToolPlanGet } from '@/lib/server/plan-api'
import { defineRouteHandlers } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/plans/$planRef')({
  server: { handlers: defineRouteHandlers<{ planRef: string }>({ GET: ({ request, params }) => handleToolPlanGet(request, params.planRef) }) },
})
