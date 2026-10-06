import { createFileRoute } from '@tanstack/react-router'
import { handleToolPlanQuotePost } from '@/lib/server/plan-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/plans/quote')({
  server: { handlers: postOnlyRoute((request) => handleToolPlanQuotePost(request)) },
})
