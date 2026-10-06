import { createFileRoute } from '@tanstack/react-router'

import { handleFeedbackPost } from '@/lib/server/feedback-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/feedback')({
  server: { handlers: postOnlyRoute(handleFeedbackPost) },
})
