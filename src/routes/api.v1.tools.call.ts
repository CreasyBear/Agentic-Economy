import { createFileRoute } from '@tanstack/react-router'

import { handleToolCallPost } from '@/lib/server/call-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/call')({
  server: {
    handlers: postOnlyRoute((request) => handleToolCallPost(request)),
  },
})
