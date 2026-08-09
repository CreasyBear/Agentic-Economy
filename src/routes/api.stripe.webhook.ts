import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import {
  handleStripeWebhookRequest as handleMoneyStripeWebhook,
  type StripeWebhookApplier,
  type StripeWebhookVerifier,
} from '@/modules/money/server'

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

type StripeWebhookOptions = Readonly<{
  verifier?: StripeWebhookVerifier
  applier?: StripeWebhookApplier
}>

export async function handleStripeWebhookRequest(request: Request, options: StripeWebhookOptions = {}): Promise<Response> {
  const verifier = options.verifier ?? {
    verify: async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }),
  }
  const applier = options.applier ?? {
    apply: async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }),
  }
  return await handleMoneyStripeWebhook({ request, verifier, applier })
}
