import { createFileRoute } from '@tanstack/react-router'

import { oauthAuthorizationServerResponse } from '@/lib/server/agent-access-oauth-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: { handlers: { GET: ({ request }) => oauthAuthorizationServerResponse(request), POST: () => methodNotAllowed(['GET']), PUT: () => methodNotAllowed(['GET']), PATCH: () => methodNotAllowed(['GET']), DELETE: () => methodNotAllowed(['GET']), HEAD: () => methodNotAllowed(['GET']), OPTIONS: () => methodNotAllowed(['GET']), TRACE: () => methodNotAllowed(['GET']), CONNECT: () => methodNotAllowed(['GET']) } },
})
