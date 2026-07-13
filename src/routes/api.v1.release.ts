import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestReleaseGet } from '@/lib/server/customer-request-release-readback-api'

export const Route = createFileRoute('/api/v1/release')({
  server: { handlers: { GET: () => handleAgentCustomerRequestReleaseGet() } },
})
