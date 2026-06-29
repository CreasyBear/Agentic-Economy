import { createHmac, timingSafeEqual } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'

import { admitBusinessActionStripeWebhookThroughSource } from '@/modules/business-action/business-action.functions'
import type { SourceHash } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'

export const Route = createFileRoute('/api/business-actions/stripe-webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleBusinessActionStripeWebhookRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

type StripeWebhookAdmissionInput = {
  rawBody: string
  headers: Headers
  webhookSecret: string | undefined
  now: number
  toleranceSeconds?: number
  payloadHash: SourceHash
}

type StripeWebhookAdmissionResult =
  | {
      kind: 'ok'
      code: string
    }
  | {
      kind: 'error'
      error: {
        code: string
        reason: string
        status?: number
      }
    }

type StripeWebhookSignatureResult =
  | {
      kind: 'ok'
      payloadHash: SourceHash
    }
  | Extract<StripeWebhookAdmissionResult, { kind: 'error' }>

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
    payloadHash: stableHash(rawBody),
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

  const result = await (options.admitWebhook ?? ((admissionInput) => defaultSourceAdmission(request, admissionInput, env)))({
    ...input,
    payloadHash: signature.payloadHash,
  })
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

function verifyStripeWebhookSignature(input: StripeWebhookAdmissionInput): StripeWebhookSignatureResult {
  if (input.webhookSecret === undefined || input.webhookSecret.trim().length === 0) {
    return stripeWebhookError('business_action_stripe_missing_webhook_secret', 'stripe_webhook_secret_required', 500)
  }

  const signatureHeader = input.headers.get('stripe-signature')
  if (signatureHeader === null || signatureHeader.trim().length === 0) {
    return stripeWebhookError('business_action_stripe_missing_signature', 'stripe_signature_header_required', 400)
  }

  const parsed = parseStripeSignatureHeader(signatureHeader)
  if (parsed === undefined) {
    return stripeWebhookError('business_action_stripe_invalid_signature', 'stripe_signature_header_malformed', 401)
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300
  const nowSeconds = Math.floor(input.now / 1_000)
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return stripeWebhookError('business_action_stripe_stale_signature', 'stripe_signature_timestamp_expired', 401)
  }

  const expected = createHmac('sha256', input.webhookSecret).update(`${parsed.timestamp}.${input.rawBody}`).digest('hex')
  const verified = parsed.signatures.some((signature) => constantTimeEqual(signature, expected))
  if (!verified) {
    return stripeWebhookError('business_action_stripe_invalid_signature', 'stripe_signature_verification_failed', 401)
  }

  return { kind: 'ok', payloadHash: input.payloadHash }
}

async function defaultSourceAdmission(
  request: Request,
  input: StripeWebhookAdmissionInput,
  env: Env
): Promise<StripeWebhookAdmissionResult> {
  const result = await admitBusinessActionStripeWebhookThroughSource(
    {
      rawBody: input.rawBody,
      payloadHash: input.payloadHash,
      receivedAt: input.now,
    },
    { request, env }
  )

  if (result.kind === 'ok') {
    return {
      kind: 'ok',
      code: result.code,
    }
  }

  return {
    kind: 'error',
    error: {
      code: result.code,
      reason: result.reason,
      status: stripeWebhookSourceErrorStatus(result.code),
    },
  }
}

function stripeWebhookSourceErrorStatus(code: string): number {
  return code === 'missing_convex_url' ||
    code === 'business_action_source_unavailable' ||
    code === 'business_action_stripe_unbound_held_event'
    ? 503
    : 400
}

function parseStripeSignatureHeader(value: string): { timestamp: number; signatures: readonly string[] } | undefined {
  const parts = value.split(',').map((part) => part.trim())
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const timestamp = timestampPart === undefined ? Number.NaN : Number(timestampPart.slice(2))
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))

  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) {
    return undefined
  }

  return { timestamp, signatures }
}

function constantTimeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
}

function stripeWebhookError(code: string, reason: string, status: number): Extract<StripeWebhookAdmissionResult, { kind: 'error' }> {
  return {
    kind: 'error',
    error: {
      code,
      reason,
      status,
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
