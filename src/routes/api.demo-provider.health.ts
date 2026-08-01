import { createFileRoute } from '@tanstack/react-router'

import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/demo-provider/health')({
  server: {
    handlers: {
      GET: () => jsonResponse({ status: 'ok', provider: 'AE Demo Services' }),
      HEAD: () => new Response(null, { status: 204 }),
    },
  },
})
