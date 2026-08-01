import { createFileRoute } from '@tanstack/react-router'

import { oauthAuthorizationServerResponse } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: { handlers: { GET: ({ request }) => oauthAuthorizationServerResponse(request) } },
})
