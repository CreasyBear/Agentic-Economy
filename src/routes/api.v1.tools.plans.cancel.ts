import { createFileRoute } from '@tanstack/react-router'
import { handleToolPlanCancelPost } from '@/lib/server/plan-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/plans/cancel')({
  server: { handlers: postOnlyRoute(request => handleToolPlanCancelPost(request)) },
})
