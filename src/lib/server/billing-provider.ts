import { createHmac, timingSafeEqual } from 'node:crypto'

import { createAutumnHttpProvider } from '@/modules/billing/server'
import type { AutumnClientConfig, AutumnProvider } from '@/modules/billing/public'
import { stableHash } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type BillingProviderErrorCode =
  | 'missing_autumn_key'
  | 'missing_autumn_webhook_secret'
  | 'missing_autumn_signature_headers'
  | 'stale_autumn_signature'
  | 'invalid_autumn_signature'
  | 'invalid_autumn_webhook_payload'
  | 'unverified_webhook'

export class BillingProviderError extends Error {
  readonly code: BillingProviderErrorCode
  readonly status: number

  constructor(code: BillingProviderErrorCode, message: string, status: number) {
    super(message)
    this.name = 'BillingProviderError'
    this.code = code
    this.status = status
  }
}

type Env = Record<string, string | undefined>

export type RawAutumnWebhook = {
  rawBody: string
  headers: Headers
  secret?: string
  now?: number
}

export type VerifiedAutumnWebhook = {
  provider: 'autumn_cloud'
  providerEventId: string
  eventType: string
  payloadHash: string
  redactedPayloadJson: string
  providerCustomerId?: string
  providerSessionId?: string
  providerSubscriptionId?: string
  operationId?: string
  planId?: string
  providerStatus?: 'active' | 'past_due' | 'payment_failed' | 'refunded' | 'disputed' | 'chargeback' | 'cancelled' | 'expired' | 'requires_action'
  receipt?: {
    providerReceiptId: string
    invoiceUrl?: string
    amountSummary?: string
    issuedAt: number
    status: 'paid' | 'refunded' | 'disputed' | 'chargeback'
  }
}

type AutumnReceiptStatus = NonNullable<VerifiedAutumnWebhook['receipt']>['status']
type AutumnInvoiceStatus = AutumnReceiptStatus | 'draft' | 'open' | 'uncollectible' | 'void'
type AutumnInvoiceReadback = {
  stripeId: string
  invoiceStatus?: AutumnInvoiceStatus
  hostedInvoiceUrl?: string
  total?: number
  currency?: string
  issuedAt?: number
}

export function createAutumnProviderFromEnv(env: Env = process.env): AutumnProvider {
  return createAutumnHttpProvider(readAutumnClientConfig(env))
}

export function readAutumnClientConfig(env: Env = process.env): AutumnClientConfig {
  const secretKey = readEnv(env, 'AUTUMN_SECRET_KEY')
  if (secretKey === undefined) {
    throw new BillingProviderError('missing_autumn_key', 'AUTUMN_SECRET_KEY is required for Autumn provider calls.', 500)
  }

  const config: AutumnClientConfig = { secretKey }
  const apiBaseUrl = readEnv(env, 'AUTUMN_API_BASE_URL')
  const apiVersion = readEnv(env, 'AUTUMN_API_VERSION')

  if (apiBaseUrl !== undefined) {
    config.apiBaseUrl = apiBaseUrl
  }
  if (apiVersion !== undefined) {
    config.apiVersion = apiVersion
  }

  return config
}

export function verifyAutumnWebhook(input: RawAutumnWebhook): VerifiedAutumnWebhook {
  if (input.secret === undefined || input.secret.trim().length === 0) {
    throw new BillingProviderError('missing_autumn_webhook_secret', 'AUTUMN_WEBHOOK_SECRET is required for Autumn webhooks.', 500)
  }

  const svixId = input.headers.get('svix-id')
  const svixTimestamp = input.headers.get('svix-timestamp')
  const svixSignature = input.headers.get('svix-signature')
  if (svixId === null || svixTimestamp === null || svixSignature === null) {
    throw new BillingProviderError(
      'missing_autumn_signature_headers',
      'Autumn webhook is missing required Svix signature headers.',
      400
    )
  }

  assertFreshTimestamp(svixTimestamp, input.now ?? Date.now())
  if (!verifySvixSignature({ secret: input.secret, svixId, svixTimestamp, svixSignature, rawBody: input.rawBody })) {
    throw new BillingProviderError('invalid_autumn_signature', 'Autumn webhook signature verification failed.', 401)
  }

  return normalizeAutumnWebhookPayload(input.rawBody, svixId)
}

export function readAutumnWebhookSecret(env: Env = process.env): string | undefined {
  return readEnv(env, 'AUTUMN_WEBHOOK_SECRET')
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function normalizeAutumnWebhookPayload(rawBody: string, svixId: string): VerifiedAutumnWebhook {
  const payload = parseJsonObject(rawBody)
  const data = isRecord(payload.data) ? payload.data : payload
  const metadata = isRecord(data.metadata) ? data.metadata : {}
  const payloadHash = stableHash(payload as StableHashValue)
  const eventType = readString(payload.type) ?? readString(payload.event) ?? readString(data.event_type) ?? 'autumn.unknown'
  const subscriptions = readRecordArray(data.subscriptions).length > 0 ? readRecordArray(data.subscriptions) : readRecordArray(payload.subscriptions)
  const invoices = readRecordArray(data.invoices).length > 0 ? readRecordArray(data.invoices) : readRecordArray(payload.invoices)
  const activeSubscription = subscriptions.find((subscription) => normalizeProviderStatus(readString(subscription.status)) === 'active')
  const invoice = readInvoice(data.invoice) ?? readInvoice(payload.invoice) ?? latestInvoiceReadback(invoices)
  const operationId = readString(metadata.ae_operation_id) ?? readString(data.operation_id)
  const providerCustomerId =
    readString(data.customer_id) ??
    readString(data.customerId) ??
    readString(payload.customer_id) ??
    (eventType.startsWith('billing.') ? readString(data.id) : undefined)
  const providerSessionId = readString(data.checkout_session_id) ?? readString(data.session_id)
  const providerSubscriptionId =
    readString(data.subscription_id) ?? readString(data.stripe_subscription_id) ?? readString(activeSubscription?.id)
  const planId = readString(data.plan_id) ?? readPlanId(activeSubscription)
  const providerStatus = normalizeProviderStatus(
    readString(data.status) ?? readString(data.subscription_status) ?? readString(activeSubscription?.status) ?? eventType
  )
  const receipt = invoice === undefined ? undefined : receiptFromInvoice(invoice, providerStatus)
  const redactedPayload = {
    providerEventId: svixId,
    eventType,
    providerCustomerId: providerCustomerId ?? null,
    providerSessionId: providerSessionId ?? null,
    providerSubscriptionId: providerSubscriptionId ?? null,
    operationId: operationId ?? null,
    planId: planId ?? readString(metadata.ae_offer_id) ?? null,
    providerStatus: providerStatus ?? null,
    payloadHash,
    receiptProviderRef: receipt?.providerReceiptId ?? null,
  }

  return {
    provider: 'autumn_cloud',
    providerEventId: svixId,
    eventType,
    payloadHash,
    redactedPayloadJson: JSON.stringify(redactedPayload),
    ...(operationId === undefined ? {} : { operationId }),
    ...(providerCustomerId === undefined ? {} : { providerCustomerId }),
    ...(providerSessionId === undefined ? {} : { providerSessionId }),
    ...(providerSubscriptionId === undefined ? {} : { providerSubscriptionId }),
    ...(planId === undefined ? {} : { planId }),
    ...(providerStatus === undefined ? {} : { providerStatus }),
    ...(receipt === undefined ? {} : { receipt }),
  }
}

function verifySvixSignature(input: {
  secret: string
  svixId: string
  svixTimestamp: string
  svixSignature: string
  rawBody: string
}): boolean {
  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`
  const expected = createHmac('sha256', decodeSvixSecret(input.secret)).update(signedContent).digest('base64')
  return readSvixSignatures(input.svixSignature).some((candidate) => constantTimeEqual(candidate, expected))
}

function decodeSvixSecret(secret: string): Buffer {
  const normalized = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(normalized, 'base64')
}

function readSvixSignatures(header: string): string[] {
  return header
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice('v1,'.length))
    .filter((part) => part.length > 0)
}

function constantTimeEqual(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate)
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
}

function assertFreshTimestamp(timestamp: string, now: number): void {
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000) {
    throw new BillingProviderError('stale_autumn_signature', 'Autumn webhook signature timestamp is outside tolerance.', 401)
  }
}

function parseJsonObject(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown
    if (isRecord(parsed)) {
      return parsed
    }
  } catch {
    // Handled below.
  }

  throw new BillingProviderError('invalid_autumn_webhook_payload', 'Autumn webhook payload must be a JSON object.', 400)
}

function receiptFromInvoice(
  invoice: AutumnInvoiceReadback,
  providerStatus: VerifiedAutumnWebhook['providerStatus']
): VerifiedAutumnWebhook['receipt'] | undefined {
  const status = normalizeReceiptStatus(invoice.invoiceStatus, providerStatus)
  if (status === undefined) {
    return undefined
  }

  return {
    providerReceiptId: invoice.stripeId,
    status,
    issuedAt: invoice.issuedAt ?? Date.now(),
    ...(invoice.hostedInvoiceUrl === undefined ? {} : { invoiceUrl: invoice.hostedInvoiceUrl }),
    ...(invoice.total === undefined || invoice.currency === undefined ? {} : { amountSummary: `${invoice.total} ${invoice.currency}` }),
  }
}

function readInvoice(value: unknown): AutumnInvoiceReadback | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const stripeId = readString(value.stripe_id) ?? readString(value.stripeId) ?? readString(value.id)
  if (stripeId === undefined) {
    return undefined
  }
  const hostedInvoiceUrl = readString(value.hosted_invoice_url) ?? readString(value.hostedInvoiceUrl)
  const total = readNumber(value.total)
  const currency = readString(value.currency)
  const issuedAt = readNumber(value.created_at) ?? readNumber(value.issued_at)
  const invoiceStatus = normalizeInvoiceStatus(readString(value.status))

  return {
    stripeId,
    ...(invoiceStatus === undefined ? {} : { invoiceStatus }),
    ...(hostedInvoiceUrl === undefined ? {} : { hostedInvoiceUrl }),
    ...(total === undefined ? {} : { total }),
    ...(currency === undefined ? {} : { currency }),
    ...(issuedAt === undefined ? {} : { issuedAt }),
  }
}

function latestInvoiceReadback(values: readonly Record<string, unknown>[]): AutumnInvoiceReadback | undefined {
  const invoices = values.map(readInvoice).filter((invoice): invoice is AutumnInvoiceReadback => invoice !== undefined)
  return invoices.find((invoice) => invoice.invoiceStatus === 'paid') ?? invoices[0]
}

function readPlanId(value: Record<string, unknown> | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const plan = isRecord(value.plan) ? value.plan : undefined
  return readString(value.plan_id) ?? readString(value.planId) ?? readString(plan?.id)
}

function normalizeInvoiceStatus(value: string | undefined): AutumnInvoiceStatus | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.toLowerCase()
  if (normalized === 'paid') return 'paid'
  if (normalized === 'draft') return 'draft'
  if (normalized === 'open') return 'open'
  if (normalized === 'uncollectible') return 'uncollectible'
  if (normalized === 'void') return 'void'
  if (normalized.includes('refund')) return 'refunded'
  if (normalized.includes('dispute')) return 'disputed'
  if (normalized.includes('chargeback')) return 'chargeback'
  return undefined
}

function normalizeProviderStatus(value: string | undefined): VerifiedAutumnWebhook['providerStatus'] | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.toLowerCase()
  if (normalized.includes('refund')) return 'refunded'
  if (normalized.includes('dispute')) return 'disputed'
  if (normalized.includes('chargeback')) return 'chargeback'
  if (normalized.includes('past_due')) return 'past_due'
  if (normalized.includes('payment_failed') || normalized.includes('failed')) return 'payment_failed'
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('expired')) return 'expired'
  if (normalized.includes('requires_action') || normalized.includes('required_action')) return 'requires_action'
  if (normalized.includes('active') || normalized.includes('paid') || normalized.includes('checkout.completed')) return 'active'
  return undefined
}

function normalizeReceiptStatus(
  value: string | undefined,
  providerStatus: VerifiedAutumnWebhook['providerStatus']
): AutumnReceiptStatus | undefined {
  const normalized = value?.toLowerCase()
  if (providerStatus === 'refunded' || normalized === 'refunded') return 'refunded'
  if (providerStatus === 'disputed' || normalized === 'disputed') return 'disputed'
  if (providerStatus === 'chargeback' || normalized === 'chargeback') return 'chargeback'
  if (normalized === 'paid' || providerStatus === 'active') return 'paid'
  return undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
