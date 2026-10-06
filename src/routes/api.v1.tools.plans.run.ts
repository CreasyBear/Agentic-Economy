import { createFileRoute } from '@tanstack/react-router'
import { handleToolPlanRunPost } from '@/lib/server/plan-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/plans/run')({
  server: { handlers: postOnlyRoute(request => handleToolPlanRunPost(request)) },
})
