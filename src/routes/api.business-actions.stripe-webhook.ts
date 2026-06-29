import { createFileRoute } from '@tanstack/react-router'

import {
  verifyStripeWebhookSignature,
  type StripeWebhookAdmissionInput,
  type StripeWebhookAdmissionResult,
} from '@/modules/business-action/public'

export const Route = createFileRoute('/api/business-actions/stripe-webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleBusinessActionStripeWebhookRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

type StripeWebhookHandlerOptions = {
  env?: Env
  now?: number
  admitWebhook?: (input: StripeWebhookAdmissionInput) => StripeWebhookAdmissionResult | Promise<StripeWebhookAdmissionResult>
}

export async function handleBusinessActionStripeWebhookRequest(
  request: Request,
  options: StripeWebhookHandlerOptions = {}
): Promise<Response> {
  const env = options.env ?? process.env
  const now = options.now ?? Date.now()
  const rawBody = await request.text()
  const input: StripeWebhookAdmissionInput = {
    rawBody,
    headers: request.headers,
    webhookSecret: readStripeWebhookSecret(env),
    now,
  }
  const signature = await verifyStripeWebhookSignature(input)
  if (signature.kind === 'error') {
    return stripeWebhookJsonResponse(
      {
        kind: 'error',
        code: signature.error.code,
        retryable: false,
        reason: signature.error.reason,
      },
      { status: signature.error.status ?? 401 }
    )
  }

  const result = await (options.admitWebhook ?? failClosedAdmission)(input)
  if (result.kind === 'error') {
    return stripeWebhookJsonResponse(
      {
        kind: 'error',
        code: result.error.code,
        retryable: false,
        reason: result.error.reason,
      },
      { status: result.error.status ?? 503 }
    )
  }

  return stripeWebhookJsonResponse(
    {
      kind: 'ok',
      code: result.code,
    },
    { status: 200 }
  )
}

function readStripeWebhookSecret(env: Env): string | undefined {
  const value = env.STRIPE_WEBHOOK_SECRET
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function failClosedAdmission(): StripeWebhookAdmissionResult {
  return {
    kind: 'error',
    error: {
      code: 'business_action_stripe_source_admission_unavailable',
      reason: 'business_action_stripe_source_admission_unavailable',
      status: 503,
    },
  }
}

function stripeWebhookJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}
