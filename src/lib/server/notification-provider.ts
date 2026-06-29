import { createHmac, timingSafeEqual } from 'node:crypto'

import { stableHash } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { RedactedPayload } from '@/modules/observability/public'

export type NotificationProviderErrorCode =
  | 'missing_notification_outbox_secret'
  | 'missing_clerk_secret'
  | 'missing_resend_api_key'
  | 'missing_resend_from'
  | 'missing_novu_secret_key'
  | 'missing_novu_workflow'
  | 'notification_dispatch_unauthorized'
  | 'invalid_notification_dispatch_payload'
  | 'unsupported_notification_dispatch'
  | 'missing_resend_webhook_secret'
  | 'missing_resend_signature_headers'
  | 'stale_resend_signature'
  | 'invalid_resend_signature'
  | 'invalid_resend_webhook_payload'
  | 'clerk_owner_lookup_failed'
  | 'owner_delivery_address_not_found'
  | 'invalid_owner_delivery_address'
  | 'resend_send_failed'
  | 'invalid_resend_send_payload'
  | 'novu_trigger_failed'
  | 'invalid_novu_trigger_payload'
  | 'novu_readback_failed'
  | 'invalid_novu_readback_payload'

export class NotificationProviderError extends Error {
  readonly code: NotificationProviderErrorCode
  readonly status: number

  constructor(code: NotificationProviderErrorCode, message: string, status: number) {
    super(message)
    this.name = 'NotificationProviderError'
    this.code = code
    this.status = status
  }
}

type Env = Record<string, string | undefined>

export type ResendClientConfig = {
  apiKey: string
  from: string
  apiBaseUrl: string
}

export type NovuClientConfig = {
  secretKey: string
  apiBaseUrl: string
  ownerInquiryWorkflowId: string
  customerInquiryWorkflowId?: string
}

export type ClerkOwnerDeliveryAddress = {
  clerkUserId: string
  email: string
  addressHash: string
  redactedAddress: '[redacted]'
}

export type ResolveClerkOwnerDeliveryAddressInput = {
  clerkUserId: string
  secretKey: string
  apiBaseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type SendResendNotificationEmailInput = {
  config: ResendClientConfig
  to: string
  subject: string
  text: string
  html?: string
  idempotencyKey: string
  fetch?: typeof globalThis.fetch
}

export type SendOwnerInquiryResendEmailInput = {
  config: ResendClientConfig
  ownerEmail: string
  dispatch: {
    dispatchId: string
    providerIdempotencyKey: string
    inquiryThreadId: string
    businessName?: string
    businessSlug?: string
  }
  appBaseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type ResendProviderSendResult = {
  kind: 'ok'
  status: 'sent'
  providerResponseHash: string
  resendMessageId: string
}

export type NovuProviderTriggerResult = {
  kind: 'ok'
  status: 'triggered'
  providerResponseHash: string
  novuTransactionId: string
  novuWorkflowId: string
  novuSubscriberId: string
  novuMessageId?: string
}

export type SendOwnerInquiryNovuInput = {
  config: NovuClientConfig
  subscriberId: string
  dispatch: {
    dispatchId: string
    providerIdempotencyKey: string
    inquiryThreadId: string
    businessName?: string
    businessSlug?: string
  }
  appBaseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type NovuMessageChannel = 'in_app' | 'email' | 'sms' | 'chat' | 'push' | 'unknown'
export type NovuMessageReadbackStatus = 'sent' | 'error' | 'warning' | 'unknown'

export type NovuTransactionMessageReadback = {
  kind: 'ok'
  transactionId: string
  providerResponseHash: string
  totalCount: number
  hasMore: boolean
  messages: {
    novuMessageId?: string
    subscriberId?: string
    transactionId: string
    channel: NovuMessageChannel
    status: NovuMessageReadbackStatus
    createdAt?: string
  }[]
}

export type ReadNovuTransactionMessagesInput = {
  config: NovuClientConfig
  transactionId: string
  subscriberId?: string
  fetch?: typeof globalThis.fetch
}

export type ResendVerifiedWebhook = {
  providerFamily: 'resend'
  providerEventId: string
  logicalObjectKey: string
  eventType: string
  payloadHash: string
  redactedPayloadJson: string
}

export type VerifyResendWebhookInput = {
  rawBody: string
  headers: Headers
  secret: string
  now?: number
}

const resendSignatureToleranceMs = 5 * 60 * 1000
const clerkApiBaseUrl = 'https://api.clerk.com/v1'
const resendApiBaseUrl = 'https://api.resend.com'
const novuApiBaseUrl = 'https://api.novu.co'

export function readNotificationOutboxSystemKey(env: Env = process.env): string {
  const value = readEnv(env, 'AE_NOTIFICATION_OUTBOX_SECRET')
  if (value === undefined) {
    throw new NotificationProviderError(
      'missing_notification_outbox_secret',
      'AE_NOTIFICATION_OUTBOX_SECRET is required for notification outbox writes.',
      500
    )
  }

  return value
}

export function readClerkSecretKey(env: Env = process.env): string {
  const value = readEnv(env, 'CLERK_SECRET_KEY')
  if (value === undefined) {
    throw new NotificationProviderError(
      'missing_clerk_secret',
      'CLERK_SECRET_KEY is required for server-side owner delivery address lookup.',
      500
    )
  }

  return value
}

export function readResendClientConfig(env: Env = process.env): ResendClientConfig {
  const apiKey = readEnv(env, 'RESEND_API_KEY')
  if (apiKey === undefined) {
    throw new NotificationProviderError(
      'missing_resend_api_key',
      'RESEND_API_KEY is required for Resend provider calls.',
      500
    )
  }

  const from = readEnv(env, 'RESEND_FROM')
  if (from === undefined) {
    throw new NotificationProviderError(
      'missing_resend_from',
      'RESEND_FROM is required for Resend provider calls.',
      500
    )
  }

  return {
    apiKey,
    from,
    apiBaseUrl: readEnv(env, 'RESEND_API_BASE_URL') ?? resendApiBaseUrl,
  }
}

export function readResendWebhookSecret(env: Env = process.env): string {
  const value = readEnv(env, 'RESEND_WEBHOOK_SECRET')
  if (value === undefined) {
    throw new NotificationProviderError(
      'missing_resend_webhook_secret',
      'RESEND_WEBHOOK_SECRET is required for Resend webhook verification.',
      500
    )
  }

  return value
}

export function readNovuClientConfig(env: Env = process.env): NovuClientConfig {
  const secretKey = readEnv(env, 'NOVU_SECRET_KEY')
  if (secretKey === undefined) {
    throw new NotificationProviderError(
      'missing_novu_secret_key',
      'NOVU_SECRET_KEY is required for Novu provider calls.',
      500
    )
  }

  const ownerInquiryWorkflowId = readEnv(env, 'NOVU_WORKFLOW_INQUIRY_OWNER')
  if (ownerInquiryWorkflowId === undefined) {
    throw new NotificationProviderError(
      'missing_novu_workflow',
      'NOVU_WORKFLOW_INQUIRY_OWNER is required for owner inquiry Novu provider calls.',
      500
    )
  }

  const customerInquiryWorkflowId = readEnv(env, 'NOVU_WORKFLOW_INQUIRY_CUSTOMER')
  return {
    secretKey,
    ownerInquiryWorkflowId,
    apiBaseUrl: readEnv(env, 'NOVU_API_BASE_URL') ?? novuApiBaseUrl,
    ...(customerInquiryWorkflowId === undefined ? {} : { customerInquiryWorkflowId }),
  }
}

export async function resolveClerkOwnerDeliveryAddress(
  input: ResolveClerkOwnerDeliveryAddressInput
): Promise<ClerkOwnerDeliveryAddress> {
  const clerkUserId = input.clerkUserId.trim()
  if (clerkUserId.length === 0) {
    throw new NotificationProviderError(
      'invalid_owner_delivery_address',
      'Owner Clerk user id is required for delivery address lookup.',
      500
    )
  }

  const fetcher = input.fetch ?? globalThis.fetch
  const response = await fetcher(`${trimTrailingSlash(input.apiBaseUrl ?? clerkApiBaseUrl)}/users/${encodeURIComponent(clerkUserId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.secretKey}`,
    },
  })

  if (!response.ok) {
    throw new NotificationProviderError(
      response.status === 404 ? 'owner_delivery_address_not_found' : 'clerk_owner_lookup_failed',
      `Clerk owner delivery address lookup failed with status ${response.status}.`,
      502
    )
  }

  const user = await readJsonResponseObject(response, 'clerk_owner_lookup_failed')
  const email = selectClerkPrimaryEmail(user)
  if (email === undefined) {
    throw new NotificationProviderError(
      'owner_delivery_address_not_found',
      'Clerk owner record does not expose a deliverable email address.',
      502
    )
  }

  return {
    clerkUserId,
    email,
    addressHash: stableHash({ provider: 'clerk', clerkUserId, email }),
    redactedAddress: '[redacted]',
  }
}

export async function sendOwnerInquiryResendEmail(
  input: SendOwnerInquiryResendEmailInput
): Promise<ResendProviderSendResult> {
  const businessName = truncateLine(input.dispatch.businessName ?? 'your business', 80)
  const ownerLink = ownerInquiryLink(input.appBaseUrl, input.dispatch.inquiryThreadId)
  const text = [
    `New inquiry for ${businessName}.`,
    ownerLink === undefined ? 'Open your Agentic Economy owner inbox to reply.' : `Open it here: ${ownerLink}`,
    'Delivery state is tracked in Agentic Economy.',
  ].join('\n\n')

  return sendResendNotificationEmail({
    config: input.config,
    to: input.ownerEmail,
    subject: truncateLine(`New inquiry for ${businessName}`, 120),
    text,
    idempotencyKey: input.dispatch.providerIdempotencyKey,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  })
}

export async function sendResendNotificationEmail(
  input: SendResendNotificationEmailInput
): Promise<ResendProviderSendResult> {
  const to = normalizeEmail(input.to)
  if (to === undefined) {
    throw new NotificationProviderError(
      'invalid_owner_delivery_address',
      'Owner delivery address is invalid.',
      500
    )
  }

  const fetcher = input.fetch ?? globalThis.fetch
  const payload = {
    from: input.config.from,
    to: [to],
    subject: truncateLine(input.subject, 180),
    text: input.text,
    ...(input.html === undefined ? {} : { html: input.html }),
  }
  const response = await fetcher(`${trimTrailingSlash(input.config.apiBaseUrl)}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(payload),
  })

  const responseBody = await response.text()
  if (!response.ok) {
    throw new NotificationProviderError(
      'resend_send_failed',
      `Resend send failed with status ${response.status}.`,
      response.status >= 500 ? 502 : 500
    )
  }

  const parsed = parseOptionalJsonObject(responseBody)
  const data = isRecord(parsed?.data) ? parsed.data : {}
  const resendMessageId = readString(parsed?.id) ?? readString(data.id)
  if (resendMessageId === undefined) {
    throw new NotificationProviderError(
      'invalid_resend_send_payload',
      'Resend send response did not include a message id.',
      502
    )
  }

  return {
    kind: 'ok',
    status: 'sent',
    resendMessageId,
    providerResponseHash: stableHash({
      providerFamily: 'resend',
      status: response.status,
      resendMessageId,
    }),
  }
}

export async function triggerOwnerInquiryNovuWorkflow(
  input: SendOwnerInquiryNovuInput
): Promise<NovuProviderTriggerResult> {
  const subscriberId = normalizeIdentifier(input.subscriberId, 'invalid_novu_trigger_payload', 'Novu subscriber id is required.')
  const idempotencyKey = normalizeNovuIdempotencyKey(input.dispatch.providerIdempotencyKey)
  const transactionId = idempotencyKey
  const ownerLink = ownerInquiryLink(input.appBaseUrl, input.dispatch.inquiryThreadId)
  const payload: RedactedPayload = {
    dispatchId: input.dispatch.dispatchId,
    inquiryThreadId: input.dispatch.inquiryThreadId,
    businessSlug: input.dispatch.businessSlug ?? 'unknown',
    businessName: truncateLine(input.dispatch.businessName ?? 'your business', 80),
    ...(ownerLink === undefined ? {} : { ownerInboxUrl: ownerLink }),
  }
  const requestPayload = {
    name: input.config.ownerInquiryWorkflowId,
    to: { subscriberId },
    transactionId,
    payload,
  }

  const fetcher = input.fetch ?? globalThis.fetch
  const response = await fetcher(`${trimTrailingSlash(input.config.apiBaseUrl)}/v1/events/trigger`, {
    method: 'POST',
    headers: {
      Authorization: `ApiKey ${input.config.secretKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(requestPayload),
  })

  const responseBody = await response.text()
  if (!response.ok) {
    throw new NotificationProviderError(
      'novu_trigger_failed',
      `Novu trigger failed with status ${response.status}.`,
      response.status >= 500 ? 502 : 500
    )
  }

  const parsed = parseOptionalJsonObject(responseBody)
  const responseTransactionId = readString(parsed.transactionId) ?? transactionId
  const responseStatus = readString(parsed.status)
  if (parsed.acknowledged === false || responseStatus === 'error') {
    throw new NotificationProviderError(
      'novu_trigger_failed',
      'Novu trigger response did not acknowledge the workflow.',
      502
    )
  }

  const novuMessageId = readString(parsed.messageId) ?? readString(parsed._id)
  return {
    kind: 'ok',
    status: 'triggered',
    novuTransactionId: responseTransactionId,
    novuWorkflowId: input.config.ownerInquiryWorkflowId,
    novuSubscriberId: subscriberId,
    ...(novuMessageId === undefined ? {} : { novuMessageId }),
    providerResponseHash: stableHash({
      providerFamily: 'novu',
      status: response.status,
      transactionId: responseTransactionId,
      workflowId: input.config.ownerInquiryWorkflowId,
      subscriberId,
    }),
  }
}

export async function readNovuTransactionMessages(
  input: ReadNovuTransactionMessagesInput
): Promise<NovuTransactionMessageReadback> {
  const transactionId = normalizeIdentifier(
    input.transactionId,
    'invalid_novu_readback_payload',
    'Novu transaction id is required for readback.'
  )
  const url = new URL('/v1/messages', `${trimTrailingSlash(input.config.apiBaseUrl)}/`)
  url.searchParams.set('transactionId', transactionId)
  url.searchParams.set('limit', '10')
  if (input.subscriberId !== undefined) {
    url.searchParams.set('subscriberId', normalizeIdentifier(input.subscriberId, 'invalid_novu_readback_payload', 'Novu subscriber id is invalid.'))
  }

  const fetcher = input.fetch ?? globalThis.fetch
  const response = await fetcher(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `ApiKey ${input.config.secretKey}`,
      Accept: 'application/json',
    },
  })

  const responseBody = await response.text()
  if (!response.ok) {
    throw new NotificationProviderError(
      'novu_readback_failed',
      `Novu message readback failed with status ${response.status}.`,
      response.status >= 500 ? 502 : 500
    )
  }

  const parsed = parseOptionalJsonObject(responseBody)
  const messages = readArray(parsed.data)?.map((message) => normalizeNovuMessage(message, transactionId)) ?? []
  const totalCount = readNumber(parsed.totalCount) ?? messages.length
  const hasMore = typeof parsed.hasMore === 'boolean' ? parsed.hasMore : false

  return {
    kind: 'ok',
    transactionId,
    totalCount,
    hasMore,
    messages,
    providerResponseHash: stableHash({
      providerFamily: 'novu',
      transactionId,
      totalCount,
      messageCount: messages.length,
      statuses: messages.map((message) => message.status),
    }),
  }
}

export function verifyResendWebhook(input: VerifyResendWebhookInput): ResendVerifiedWebhook {
  const svixId = input.headers.get('svix-id')
  const svixTimestamp = input.headers.get('svix-timestamp')
  const svixSignature = input.headers.get('svix-signature')
  if (svixId === null || svixTimestamp === null || svixSignature === null) {
    throw new NotificationProviderError(
      'missing_resend_signature_headers',
      'Resend webhook is missing required Svix signature headers.',
      400
    )
  }

  assertFreshTimestamp(svixTimestamp, input.now ?? Date.now())
  if (!verifySvixSignature({ secret: input.secret, svixId, svixTimestamp, svixSignature, rawBody: input.rawBody })) {
    throw new NotificationProviderError('invalid_resend_signature', 'Resend webhook signature verification failed.', 401)
  }

  return normalizeResendWebhookPayload(input.rawBody, svixId)
}

export function normalizeResendWebhookPayload(rawBody: string, svixId: string): ResendVerifiedWebhook {
  const payload = parseJsonObject(rawBody)
  const data = isRecord(payload.data) ? payload.data : {}
  const eventType = readString(payload.type) ?? readString(payload.event) ?? 'email.unknown'
  const logicalObjectKey = readString(data.email_id) ?? readString(data.id) ?? readString(payload.email_id) ?? svixId
  const payloadHash = stableHash(payload as StableHashValue)
  const redactedPayload: RedactedPayload = {
    providerEventId: svixId,
    logicalObjectKey,
    eventType,
    payloadHash,
  }

  return {
    providerFamily: 'resend',
    providerEventId: svixId,
    logicalObjectKey,
    eventType,
    payloadHash,
    redactedPayloadJson: JSON.stringify(redactedPayload),
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
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > resendSignatureToleranceMs) {
    throw new NotificationProviderError('stale_resend_signature', 'Resend webhook signature timestamp is outside tolerance.', 401)
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

  throw new NotificationProviderError('invalid_resend_webhook_payload', 'Resend webhook payload must be a JSON object.', 400)
}

async function readJsonResponseObject(
  response: Response,
  errorCode: Extract<NotificationProviderErrorCode, 'clerk_owner_lookup_failed'>
): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown
    if (isRecord(parsed)) {
      return parsed
    }
  } catch {
    // Handled below.
  }

  throw new NotificationProviderError(errorCode, 'Provider response must be a JSON object.', 502)
}

function parseOptionalJsonObject(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function selectClerkPrimaryEmail(user: Record<string, unknown>): string | undefined {
  const primaryEmailId = readString(user.primary_email_address_id) ?? readString(user.primaryEmailAddressId)
  const emailAddresses = readArray(user.email_addresses) ?? readArray(user.emailAddresses) ?? []
  const primary = emailAddresses.find((emailAddress) => readString(emailAddress.id) === primaryEmailId)
  return readClerkEmailAddress(primary) ?? emailAddresses.map(readClerkEmailAddress).find((email) => email !== undefined)
}

function readClerkEmailAddress(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return normalizeEmail(readString(value.email_address) ?? readString(value.emailAddress))
}

function ownerInquiryLink(appBaseUrl: string | undefined, inquiryThreadId: string): string | undefined {
  if (appBaseUrl === undefined || appBaseUrl.trim().length === 0) {
    return undefined
  }

  const url = new URL(`/owner/inquiries/${encodeURIComponent(inquiryThreadId)}`, appBaseUrl)
  return url.toString()
}

function readArray(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value) ? value.filter(isRecord) : undefined
}

function normalizeNovuMessage(
  message: Record<string, unknown>,
  fallbackTransactionId: string
): NovuTransactionMessageReadback['messages'][number] {
  const subscriber = isRecord(message.subscriber) ? message.subscriber : {}
  const subscriberId = readString(subscriber.subscriberId) ?? readString(message._subscriberId)
  const novuMessageId = readString(message._id)
  const createdAt = readString(message.createdAt)

  return {
    transactionId: readString(message.transactionId) ?? fallbackTransactionId,
    channel: readNovuMessageChannel(message.channel),
    status: readNovuMessageStatus(message.status),
    ...(novuMessageId === undefined ? {} : { novuMessageId }),
    ...(subscriberId === undefined ? {} : { subscriberId }),
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}

function readNovuMessageChannel(value: unknown): NovuMessageChannel {
  return value === 'in_app' || value === 'email' || value === 'sms' || value === 'chat' || value === 'push'
    ? value
    : 'unknown'
}

function readNovuMessageStatus(value: unknown): NovuMessageReadbackStatus {
  return value === 'sent' || value === 'error' || value === 'warning' ? value : 'unknown'
}

function normalizeEmail(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined
}

function normalizeIdentifier(
  value: string,
  errorCode: Extract<NotificationProviderErrorCode, 'invalid_novu_trigger_payload' | 'invalid_novu_readback_payload'>,
  message: string
): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new NotificationProviderError(errorCode, message, 500)
  }

  return normalized
}

function normalizeNovuIdempotencyKey(value: string): string {
  const normalized = normalizeIdentifier(
    value,
    'invalid_novu_trigger_payload',
    'Novu idempotency key is required.'
  )
  if (normalized.length > 255) {
    throw new NotificationProviderError(
      'invalid_novu_trigger_payload',
      'Novu idempotency key must be 255 characters or fewer.',
      500
    )
  }

  return normalized
}

function truncateLine(value: string, maxLength: number): string {
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length <= maxLength ? line : `${line.slice(0, Math.max(0, maxLength - 1))}...`
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
