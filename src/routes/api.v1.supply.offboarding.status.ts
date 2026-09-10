import { createFileRoute } from '@tanstack/react-router'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'

export const Route = createFileRoute('/api/v1/supply/offboarding/status')({
  server: {
    handlers: {
      POST: ({ request }) => handleSupplyActionPost(request, 'offboardingStatus'),
    },
  },
})
