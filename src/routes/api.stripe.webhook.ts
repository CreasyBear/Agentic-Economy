import { createFileRoute } from '@tanstack/react-router'

import {
  handleStripeWebhookRequest as handleMoneyStripeWebhook,
  type StripeWebhookApplier,
  type StripeWebhookVerifier,
} from '@/modules/money/public'

export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleStripeWebhookRequest(request),
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
