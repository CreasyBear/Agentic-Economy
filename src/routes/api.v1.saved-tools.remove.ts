import { createFileRoute } from '@tanstack/react-router'

import { handleSavedToolsPost } from '@/lib/server/saved-tools-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/saved-tools/remove')({
  server: { handlers: postOnlyRoute((request) => handleSavedToolsPost(request, 'remove')) },
})
