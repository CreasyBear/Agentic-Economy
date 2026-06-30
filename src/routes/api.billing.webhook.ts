import { createFileRoute } from '@tanstack/react-router'

import { admitAutumnBillingWebhookThroughSource } from '@/modules/billing/billing.functions'

export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleBillingWebhookRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

type BillingWebhookHandlerOptions = {
  env?: Env
  now?: number
  admitWebhook?: typeof admitAutumnBillingWebhookThroughSource
}

export async function handleBillingWebhookRequest(
  request: Request,
  options: BillingWebhookHandlerOptions = {}
): Promise<Response> {
  const env = options.env ?? process.env
  const rawBody = await request.text()
  const { readAutumnWebhookSecret, verifyAutumnWebhook } = await readBillingProviderModule()
  const secret = readAutumnWebhookSecret(env)

  try {
    const verified = verifyAutumnWebhook({
      rawBody,
      headers: request.headers,
      ...(secret === undefined ? {} : { secret }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
    const result = await (options.admitWebhook ?? admitAutumnBillingWebhookThroughSource)(
      {
        providerEventId: verified.providerEventId,
        eventType: verified.eventType,
        payloadHash: verified.payloadHash,
        redactedPayloadJson: verified.redactedPayloadJson,
        ...(verified.providerCustomerId === undefined ? {} : { providerCustomerId: verified.providerCustomerId }),
        ...(verified.providerSessionId === undefined ? {} : { providerSessionId: verified.providerSessionId }),
        ...(verified.providerSubscriptionId === undefined ? {} : { providerSubscriptionId: verified.providerSubscriptionId }),
        ...(verified.operationId === undefined ? {} : { operationId: verified.operationId }),
        ...(verified.planId === undefined ? {} : { planId: verified.planId }),
        ...(verified.providerStatus === undefined ? {} : { providerStatus: verified.providerStatus }),
        ...(verified.receipt === undefined ? {} : { receipt: verified.receipt }),
      },
      { request, env }
    )

    if (result.kind === 'error') {
      return billingWebhookJsonResponse(
        { kind: 'error', code: result.code, retryable: result.retryable, reason: result.reason },
        { status: result.retryable ? 503 : 400 }
      )
    }

    return billingWebhookJsonResponse({ kind: 'ok', code: result.code })
  } catch (error) {
    if (isBillingProviderError(error)) {
      return billingWebhookJsonResponse(
        { kind: 'error', code: error.code, retryable: false, reason: error.message },
        { status: error.status }
      )
    }

    throw error
  }
}

async function readBillingProviderModule() {
  if (import.meta.env.SSR) {
    return await import('@/lib/server/billing-provider')
  }

  throw new Error('Autumn billing webhook verification is only available on the server.')
}

function isBillingProviderError(error: unknown): error is Error & { code: string; status: number } {
  return (
    error instanceof Error &&
    'code' in error &&
    'status' in error &&
    typeof error.code === 'string' &&
    typeof error.status === 'number'
  )
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
