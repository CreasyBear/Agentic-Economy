import { createFileRoute } from '@tanstack/react-router'

import { handleMarketRequestPost } from '@/lib/server/market-demand-api'

export const Route = createFileRoute('/api/v1/market-requests/list')({
  server: { handlers: { POST: ({ request }) => handleMarketRequestPost(request, 'list') } },
})
