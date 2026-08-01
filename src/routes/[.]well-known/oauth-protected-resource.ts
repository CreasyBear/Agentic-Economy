import { createFileRoute } from '@tanstack/react-router'

import { oauthProtectedResourceResponse } from '@/lib/server/customer-request-agent-oauth-api'

export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: { handlers: { GET: ({ request }) => oauthProtectedResourceResponse(request) } },
})
