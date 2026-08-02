import { createFileRoute } from '@tanstack/react-router'

import { handleWorkTreeSetup } from '@/lib/server/work-tree-setup-api'

export { handleWorkTreeSetup }

export const Route = createFileRoute('/api/v1/work-tree/setup')({
  server: {
    handlers: {
      POST: ({ request }) => handleWorkTreeSetup(request),
    },
  },
})
