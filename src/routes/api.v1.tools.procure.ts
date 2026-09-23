import { createFileRoute } from '@tanstack/react-router'

import { handleToolProcurePost } from '@/lib/server/procure-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/tools/procure')({
  server: {
    handlers: postOnlyRoute((request) => handleToolProcurePost(request)),
  },
})
