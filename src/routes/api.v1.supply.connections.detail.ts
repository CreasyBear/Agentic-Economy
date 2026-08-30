import { createFileRoute } from '@tanstack/react-router'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'

export const Route = createFileRoute('/api/v1/supply/connections/detail')({
  server: { handlers: { POST: ({ request }) => handleSupplyActionPost(request, 'connectionDetail') } },
})
