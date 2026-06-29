import { createParkedFileRoute } from '@/future-phases/route-helpers'
import {
  BillingProviderError,
  readAutumnWebhookSecret,
  verifyAutumnWebhook,
} from '@/lib/server/billing-provider'

export const Route = createParkedFileRoute<never>('/api/billing/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleBillingWebhookRequest(request),
    },
  },
})

export async function handleBillingWebhookRequest(request: Request): Promise<Response> {
  try {
    const secret = readAutumnWebhookSecret()
    await verifyAutumnWebhook({
      rawBody: await request.text(),
      headers: request.headers,
      ...(secret === undefined ? {} : { secret }),
    })

    return billingWebhookJsonResponse({ kind: 'ok' })
  } catch (error) {
    if (error instanceof BillingProviderError) {
      return billingWebhookJsonResponse(
        { kind: 'error', code: error.code, retryable: false, reason: error.message },
        { status: error.status }
      )
    }

    throw error
  }
}

function billingWebhookJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}
