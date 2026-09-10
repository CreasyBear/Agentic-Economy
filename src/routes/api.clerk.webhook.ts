import { createFileRoute } from '@tanstack/react-router'

import { handleClerkSecurityWebhookRequest } from '@/lib/server/clerk-security-webhook'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/clerk/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleClerkWebhookRequest(request),
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

export async function handleClerkWebhookRequest(request: Request): Promise<Response> {
  return await handleClerkSecurityWebhookRequest(request)
}
