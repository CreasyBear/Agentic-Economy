import { createFileRoute } from '@tanstack/react-router'

import { handleAgentCustomerRequestPost } from '@/lib/server/customer-request-agent-api'
import { CUSTOMER_REQUEST_AGENT_ENTRYPOINT } from '@/modules/customer-request/agent-contract'

export const Route = createFileRoute(CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path)({
  server: { handlers: { POST: ({ request }) => handleAgentCustomerRequestPost(request) } },
})
