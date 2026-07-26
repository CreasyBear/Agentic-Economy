import { constantTimeStringEqual } from '@/lib/server/constant-time'

import { encodePrivateRecordFragment } from '@/lib/observability/private-route-safety'
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
    serviceName?: string
    customerMessageFirstLine?: string
    isFirstInquiryForBusiness?: boolean
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
  status: 'triggered' | 'sent'
  providerResponseHash: string
  novuTransactionId: string
  novuWorkflowId: string
  novuSubscriberId: string
  novuMessageId?: string
}

export type NovuSubscriberProfile = {
  subscriberId: string
  email?: string
  phone?: string
}

export type SendInquiryNovuInput = {
  config: NovuClientConfig
  recipientRole: 'owner' | 'customer'
  subscriber: NovuSubscriberProfile
  dispatch: {
    dispatchId: string
    providerIdempotencyKey: string
    inquiryThreadId: string
    inquiryMessageId?: string
    businessName?: string
    businessSlug?: string
    customerAccessToken?: string
  }
  appBaseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type NovuProviderDispatchResult =
  | NovuProviderTriggerResult
  | {
      kind: 'error'
      status: 'failed'
      redactedError: string
      providerResponseHash?: string
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

export function ownerNovuSubscriberProfile(clerkUserId: string, email?: string): NovuSubscriberProfile {
  const subscriberId = normalizeIdentifier(
    clerkUserId,
    'invalid_novu_trigger_payload',
    'Owner Clerk user id is required for Novu subscriber id.'
  )
  const normalizedEmail = normalizeEmail(email)
  const prefixedSubscriberId = subscriberId.startsWith('owner:') ? subscriberId : `owner:${subscriberId}`
  return {
    subscriberId: prefixedSubscriberId,
    ...(normalizedEmail === undefined ? {} : { email: normalizedEmail }),
  }
}

export function customerNovuSubscriberProfile(inquiryThreadId: string): NovuSubscriberProfile {
  const subscriberId = normalizeIdentifier(
    inquiryThreadId,
    'invalid_novu_trigger_payload',
    'Inquiry thread id is required for customer Novu subscriber id.'
  )
  return {
    subscriberId: `customer:${subscriberId}`,
  }
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
  const serviceName = truncateLine(input.dispatch.serviceName ?? 'new service request', 80)
  const messageFirstLine = firstMessageLine(input.dispatch.customerMessageFirstLine) ?? 'The customer sent a written inquiry.'
  const ownerLink = ownerInquiryLink(input.appBaseUrl, input.dispatch.inquiryThreadId)
  const text = [
    `${serviceName} inquiry: ${messageFirstLine}`,
    input.dispatch.isFirstInquiryForBusiness === true
      ? `This is the first inquiry for ${businessName} through Agentic Economy.`
      : undefined,
    `Your ${businessName} page is free, there are no lead fees, and replies go straight to the customer.`,
    ownerLink === undefined
      ? 'Reply from your Agentic Economy owner inbox.'
      : `Reply in Agentic Economy: ${ownerLink}`,
  ].filter((line): line is string => line !== undefined).join('\n\n')

  return sendResendNotificationEmail({
    config: input.config,
    to: input.ownerEmail,
    subject: truncateLine(`New inquiry for ${businessName}`, 120),
    text,
    idempotencyKey: input.dispatch.providerIdempotencyKey,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  })
}

async function sendResendNotificationEmail(
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

export async function triggerInquiryNovuWorkflow(input: SendInquiryNovuInput): Promise<NovuProviderTriggerResult> {
  const subscriberId = normalizeIdentifier(input.subscriber.subscriberId, 'invalid_novu_trigger_payload', 'Novu subscriber id is required.')
  const idempotencyKey = normalizeNovuIdempotencyKey(input.dispatch.providerIdempotencyKey)
  const transactionId = idempotencyKey
  const workflowId = novuWorkflowIdForRecipient(input.config, input.recipientRole)
  const ownerLink = input.recipientRole === 'owner' ? ownerInquiryLink(input.appBaseUrl, input.dispatch.inquiryThreadId) : undefined
  const customerRecordLink = input.recipientRole === 'customer' && input.dispatch.customerAccessToken !== undefined
    ? customerInquiryRecordLink(input.appBaseUrl, input.dispatch.inquiryThreadId, input.dispatch.customerAccessToken)
    : undefined
  const payload: RedactedPayload = {
    dispatchId: input.dispatch.dispatchId,
    inquiryThreadId: input.dispatch.inquiryThreadId,
    ...(input.dispatch.inquiryMessageId === undefined ? {} : { inquiryMessageId: input.dispatch.inquiryMessageId }),
    recipientRole: input.recipientRole,
    businessSlug: input.dispatch.businessSlug ?? 'unknown',
    businessName: truncateLine(input.dispatch.businessName ?? 'your business', 80),
    ...(ownerLink === undefined ? {} : { ownerInboxUrl: ownerLink }),
    ...(customerRecordLink === undefined ? {} : {
      customerRecordUrl: customerRecordLink,
      emailSubject: truncateLine(`${input.dispatch.businessName ?? 'The business'} replied to your inquiry`, 120),
      emailBody: `${input.dispatch.businessName ?? 'The business'} replied. Read it on your inquiry record: ${customerRecordLink}`,
    }),
  }
  const requestPayload = {
    name: workflowId,
    to: novuSubscriberTarget(input.subscriber, subscriberId),
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
    novuWorkflowId: workflowId,
    novuSubscriberId: subscriberId,
    ...(novuMessageId === undefined ? {} : { novuMessageId }),
    providerResponseHash: stableHash({
      providerFamily: 'novu',
      status: response.status,
      transactionId: responseTransactionId,
      workflowId,
      subscriberId,
      recipientRole: input.recipientRole,
    }),
  }
}

export async function triggerOwnerInquiryNovuWorkflow(
  input: SendOwnerInquiryNovuInput
): Promise<NovuProviderTriggerResult> {
  return triggerInquiryNovuWorkflow({
    config: input.config,
    recipientRole: 'owner',
    subscriber: ownerNovuSubscriberProfile(input.subscriberId),
    dispatch: input.dispatch,
    ...(input.appBaseUrl === undefined ? {} : { appBaseUrl: input.appBaseUrl }),
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  })
}

export function mapNovuReadbackToProviderResult(
  triggerResult: NovuProviderTriggerResult,
  readback: NovuTransactionMessageReadback
): NovuProviderDispatchResult {
  if (readback.messages.some((message) => message.status === 'error')) {
    return {
      kind: 'error',
      status: 'failed',
      redactedError: 'novu_delivery_error',
      providerResponseHash: stableHash({
        providerFamily: 'novu',
        deliveryStatus: 'failed',
        triggerResponseHash: triggerResult.providerResponseHash,
        readbackResponseHash: readback.providerResponseHash,
      }),
    }
  }

  if (readback.messages.some((message) => message.status === 'sent')) {
    return {
      ...triggerResult,
      status: 'sent',
      providerResponseHash: stableHash({
        providerFamily: 'novu',
        deliveryStatus: 'sent',
        triggerResponseHash: triggerResult.providerResponseHash,
        readbackResponseHash: readback.providerResponseHash,
      }),
    }
  }

  return {
    ...triggerResult,
    providerResponseHash: stableHash({
      providerFamily: 'novu',
      deliveryStatus: 'triggered',
      triggerResponseHash: triggerResult.providerResponseHash,
      readbackResponseHash: readback.providerResponseHash,
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

export async function verifyResendWebhook(input: VerifyResendWebhookInput): Promise<ResendVerifiedWebhook> {
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
  if (!(await verifySvixSignature({ secret: input.secret, svixId, svixTimestamp, svixSignature, rawBody: input.rawBody }))) {
    throw new NotificationProviderError('invalid_resend_signature', 'Resend webhook signature verification failed.', 401)
  }

  return normalizeResendWebhookPayload(input.rawBody, svixId)
}

function normalizeResendWebhookPayload(rawBody: string, svixId: string): ResendVerifiedWebhook {
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

async function verifySvixSignature(input: {
  secret: string
  svixId: string
  svixTimestamp: string
  svixSignature: string
  rawBody: string
}): Promise<boolean> {
  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`
  const expected = await hmacSha256Base64(decodeSvixSecret(input.secret), signedContent)
  return readSvixSignatures(input.svixSignature).some((candidate) => constantTimeStringEqual(candidate, expected))
}

/**
 * Web Crypto rather than `node:crypto`. Route modules are reachable from the
 * generated client route tree, so a top-level `node:` import here throws during
 * hydration and leaves every page as inert server-rendered HTML.
 */
async function hmacSha256Base64(secret: Uint8Array<ArrayBuffer>, content: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))
  return base64FromBytes(new Uint8Array(signature))
}

function decodeSvixSecret(secret: string): Uint8Array<ArrayBuffer> {
  const normalized = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return bytesFromBase64(normalized)
}

function bytesFromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function readSvixSignatures(header: string): string[] {
  return header
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice('v1,'.length))
    .filter((part) => part.length > 0)
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

function novuWorkflowIdForRecipient(config: NovuClientConfig, recipientRole: 'owner' | 'customer'): string {
  if (recipientRole === 'owner') {
    return config.ownerInquiryWorkflowId
  }

  if (config.customerInquiryWorkflowId === undefined) {
    throw new NotificationProviderError(
      'missing_novu_workflow',
      'NOVU_WORKFLOW_INQUIRY_CUSTOMER is required for customer inquiry Novu provider calls.',
      500
    )
  }

  return config.customerInquiryWorkflowId
}

function novuSubscriberTarget(subscriber: NovuSubscriberProfile, subscriberId: string): { subscriberId: string; email?: string; phone?: string } {
  const email = normalizeEmail(subscriber.email)
  const phone = readString(subscriber.phone)
  return {
    subscriberId,
    ...(email === undefined ? {} : { email }),
    ...(phone === undefined ? {} : { phone }),
  }
}

function firstMessageLine(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const line = truncateLine(value.split(/\r?\n/).find((candidate) => candidate.trim().length > 0) ?? '', 180)
  return line.length === 0 ? undefined : line
}

function ownerInquiryLink(appBaseUrl: string | undefined, inquiryThreadId: string): string | undefined {
  if (appBaseUrl === undefined || appBaseUrl.trim().length === 0) {
    return undefined
  }

  const url = new URL(`/owner/inquiries/${encodeURIComponent(inquiryThreadId)}`, appBaseUrl)
  return url.toString()
}

/**
 * The fragment must round-trip through `decodePrivateRecordFragment`, which
 * only accepts `#record&…`. A hand-built `#record?…` link parses as no access
 * key at all, so the recipient lands on "record not available".
 */
export function customerInquiryRecordLink(appBaseUrl: string | undefined, inquiryThreadId: string, accessToken: string): string | undefined {
  if (appBaseUrl === undefined || appBaseUrl.trim().length === 0 || accessToken.trim().length === 0) {
    return undefined
  }

  const url = new URL(`/t/${encodeURIComponent(inquiryThreadId)}`, appBaseUrl)
  url.hash = encodePrivateRecordFragment(accessToken)
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
