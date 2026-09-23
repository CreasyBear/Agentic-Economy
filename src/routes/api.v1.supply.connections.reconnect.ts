import { createFileRoute } from '@tanstack/react-router'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'
import { postOnlyRoute } from '@/lib/server/gateway-json-route'

export const Route = createFileRoute('/api/v1/supply/connections/reconnect')({
  server: { handlers: postOnlyRoute((request) => handleSupplyActionPost(request, 'connectionReconnect')) },
})
