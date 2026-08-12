import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { createConvexAgentAccessOAuthStore } from '@/lib/server/agent-access-oauth-store'
import { handleOAuthTokenPost } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'
const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.clone().text()
        return await handleOAuthTokenPost(request, { store: createConvexAgentAccessOAuthStore(request, body), rateLimit: admitOAuth })
      },
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

