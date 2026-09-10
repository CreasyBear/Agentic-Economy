import { createFileRoute } from '@tanstack/react-router'

import { createHttpRateLimitAdmission } from '@/lib/server/rate-limit'
import { createConvexAgentAccessOAuthStore } from '@/lib/server/agent-access-oauth-store'
import { handleOAuthRevokePost } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

const admitOAuth = createHttpRateLimitAdmission('oauth-issuance')

export const Route = createFileRoute('/oauth/revoke')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.clone().text()
        const store = createConvexAgentAccessOAuthStore(request, body)
        return await handleOAuthRevokePost(request, { store, refreshStore: store, rateLimit: admitOAuth })
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
