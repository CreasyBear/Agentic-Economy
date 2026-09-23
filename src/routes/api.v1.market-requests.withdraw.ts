import { createFileRoute } from '@tanstack/react-router'

import { handleMarketRequestPost } from '@/lib/server/market-demand-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/market-requests/withdraw')({
  server: { handlers: postOnlyRoute((request) => handleMarketRequestPost(request, 'withdraw')) },
})
