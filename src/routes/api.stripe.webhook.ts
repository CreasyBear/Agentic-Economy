import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { handleStripeWebhookRequest as handleMoneyStripeWebhook } from '@/modules/money/server'

export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleStripeWebhookRequest(request),
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

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
  return await handleMoneyStripeWebhook(request)
}
