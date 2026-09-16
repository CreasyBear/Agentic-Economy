import { createFileRoute } from '@tanstack/react-router'

import { handleToolQuotePost } from '@/lib/server/call-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/quote')({
  server: {
    handlers: postOnlyRoute((request) => handleToolQuotePost(request)),
  },
})
