import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { handleStripeWebhookRequest as handleMoneyStripeWebhook } from '@/modules/money/server'

export const Route = createFileRoute('/api/stripe/webhook/accounts-v2')({
  server: {
    handlers: {
      POST: ({ request }) => handleStripeAccountsV2WebhookRequest(request),
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

export async function handleStripeAccountsV2WebhookRequest(request: Request): Promise<Response> {
  return await handleMoneyStripeWebhook(request, { destination: 'accounts_v2' })
}
