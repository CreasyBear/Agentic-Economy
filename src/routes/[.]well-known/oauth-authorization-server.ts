import { createFileRoute } from '@tanstack/react-router'

import { oauthAuthorizationServerResponse } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: { handlers: {
    GET: ({ request }) => oauthAuthorizationServerResponse(request),
    HEAD: ({ request }) => {
      const response = oauthAuthorizationServerResponse(request)
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
