import { createFileRoute } from '@tanstack/react-router'

import { oauthProtectedResourceResponse } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: { handlers: {
    GET: ({ request }) => oauthProtectedResourceResponse(request),
    HEAD: ({ request }) => {
      const response = oauthProtectedResourceResponse(request)
      return new Response(null, { status: response.status, headers: response.headers })
    },
    POST: () => methodNotAllowed(['GET', 'HEAD']),
    PUT: () => methodNotAllowed(['GET', 'HEAD']),
    PATCH: () => methodNotAllowed(['GET', 'HEAD']),
    DELETE: () => methodNotAllowed(['GET', 'HEAD']),
    OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
    TRACE: () => methodNotAllowed(['GET', 'HEAD']),
    CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
  } },
})
