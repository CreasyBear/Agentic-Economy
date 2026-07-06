import { createFileRoute } from '@tanstack/react-router'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  customerNovuSubscriberProfile,
  mapNovuReadbackToProviderResult,
  NotificationProviderError,
  ownerNovuSubscriberProfile,
  readClerkSecretKey,
  readNotificationOutboxSystemKey,
  readNovuClientConfig,
  readNovuTransactionMessages,
  resolveClerkOwnerDeliveryAddress,
  triggerInquiryNovuWorkflow,
} from '@/lib/server/notification-provider'
import type {
  ClerkOwnerDeliveryAddress,
  NovuClientConfig,
  NovuProviderDispatchResult,
  NovuProviderTriggerResult,
  NovuSubscriberProfile,
  NovuTransactionMessageReadback,
  ReadNovuTransactionMessagesInput,
  SendInquiryNovuInput,
} from '@/lib/server/notification-provider'

export const Route = createFileRoute('/api/notification/novu-dispatch')({
  server: {
    handlers: {
      POST: ({ request }) => handleNovuDispatchRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

const MAX_NOTIFICATION_DISPATCH_BODY_BYTES = 4 * 1024

type NotificationDispatchProjection = {
  dispatchId: string
  businessId: string
  inquiryThreadId: string
  inquiryMessageId: string
  recipientRole: 'owner' | 'customer'
  providerFamily: 'resend' | 'novu'
  status:
    | 'queued'
    | 'triggered'
    | 'sent'
    | 'delivered'
    | 'bounced'
    | 'complained'
    | 'delivery_delayed'
    | 'failed'
    | 'suppressed'
    | 'retry_scheduled'
    | 'retry_attempted'
    | 'retry_exhausted'
    | 'no_repair'
    | 'provider_missing'
    | 'orchestrator_missing'
  providerIdempotencyKey: string
  payloadHash: string
  novuTransactionId?: string
  novuWorkflowId?: string
  novuMessageId?: string
  novuSubscriberId?: string
  providerMissing: boolean
  orchestratorMissing: boolean
  retryCount: number
  operationKey: string
  correlationId: string
  createdAt: number
  updatedAt: number
}

type NotificationAttemptStatus =
  | 'pending'
  | 'triggered'
  | 'sent'
  | 'failed'
  | 'provider_missing'
  | 'orchestrator_missing'

type NotificationSystemSendReadArgs = {
  dispatchId: string
  systemKey: string
}

type NotificationRuntimeErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
}

type NotificationSystemSendReadResult =
  | {
      kind: 'ok'
      code: 'notification_dispatch_send_read'
      send: {
        dispatch: NotificationDispatchProjection
        owner: {
          ownerId: string
          clerkUserId: string
        }
        business: {
          businessId: string
          slug: string
          name: string
        }
        inquiry?: {
          serviceName?: string
          customerAccessKey?: string
          customerMessageFirstLine?: string
          isFirstInquiryForBusiness: boolean
        }
      }
    }
  | NotificationRuntimeErrorResult

type NotificationSystemSend = Extract<NotificationSystemSendReadResult, { kind: 'ok' }>['send']


type NotificationDispatchProviderResult = NovuProviderDispatchResult | {
  kind: 'error'
  status: 'provider_missing' | 'orchestrator_missing'
  redactedError: string
  retryAfter?: number
  providerResponseHash?: string
}

type NotificationRecordDispatchArgs = {
  dispatchId: string
  systemKey: string
  providerResult: NotificationDispatchProviderResult
  operationKey: string
  correlationId: string
}

type NotificationRecordDispatchResult =
  | {
      kind: 'ok'
      code:
        | 'notification_triggered'
        | 'notification_sent'
        | 'notification_provider_missing'
        | 'notification_orchestrator_missing'
        | 'notification_dispatch_failed'
        | 'notification_dispatch_replayed'
      dispatch: NotificationDispatchProjection
      attempt: {
        attemptId: string
        status: NotificationAttemptStatus
        providerResponseHash?: string
      }
    }
  | NotificationRuntimeErrorResult

type NotificationNovuDispatchResponse =
  | {
      kind: 'ok'
      code: 'notification_novu_triggered' | 'notification_novu_already_recorded'
      dispatchId: string
      dispatchStatus: string
      novuTransactionId: string
      novuWorkflowId?: string
      novuMessageId?: string
      novuSubscriberId?: string
      providerResponseHash?: string
      readbackProviderResponseHash: string
      novuMessageCount: number
      businessSlug: string
    }
  | {
      kind: 'ok'
      code: 'notification_novu_held'
      dispatchId: string
      dispatchStatus: string
      redactedError: string
      businessSlug: string
    }
  | NotificationRuntimeErrorResult

type NovuDispatchHandlerOptions = {
  env?: Env
  readDispatchForSend?: (args: NotificationSystemSendReadArgs) => Promise<NotificationSystemSendReadResult>
  triggerInquiry?: (input: SendInquiryNovuInput) => Promise<NovuProviderTriggerResult>
  triggerOwnerInquiry?: (input: SendInquiryNovuInput) => Promise<NovuProviderTriggerResult>
  readNovuMessages?: (input: ReadNovuTransactionMessagesInput) => Promise<NovuTransactionMessageReadback>
  resolveOwnerDeliveryAddress?: (input: { clerkUserId: string; secretKey: string }) => Promise<ClerkOwnerDeliveryAddress>
  recordDispatch?: (args: NotificationRecordDispatchArgs) => Promise<NotificationRecordDispatchResult>
}

const readDispatchForSendQuery = sourceQuery<NotificationSystemSendReadArgs, NotificationSystemSendReadResult>(
  'notificationOutbox:readNotificationDispatchForSystemSend'
)
const recordDispatchMutation = sourceMutation<NotificationRecordDispatchArgs, NotificationRecordDispatchResult>(
  'notificationOutbox:dispatchNotificationOutbox'
)

export async function handleNovuDispatchRequest(
  request: Request,
  options: NovuDispatchHandlerOptions = {}
): Promise<Response> {
  try {
    const env = options.env ?? process.env
    const systemKey = readNotificationOutboxSystemKey(env)
    requireDispatchAuthorization(request.headers, systemKey)

    const dispatchId = await readDispatchId(request)
    const readback = await (options.readDispatchForSend ?? defaultReadDispatchForSend)({ dispatchId, systemKey })
    if (readback.kind === 'error') {
      return notificationDispatchJsonResponse(readback, { status: statusForNotificationRuntimeError(readback.code) })
    }

    const send = readback.send
    if (send.dispatch.providerFamily !== 'novu') {
      throw new NotificationProviderError(
        'unsupported_notification_dispatch',
        'Only Novu notification dispatches can use this route.',
        422
      )
    }

    const configResult = readNovuConfig(env)
    if (configResult.kind === 'error') {
      return await recordHeldNovuDispatch({
        options,
        send,
        systemKey,
        redactedError: configResult.error.code,
      })
    }
    const config = configResult.config
    if (send.dispatch.recipientRole === 'customer' && config.customerInquiryWorkflowId === undefined) {
      return await recordHeldNovuDispatch({
        options,
        send,
        systemKey,
        redactedError: 'missing_novu_workflow',
      })
    }
    if (send.dispatch.novuTransactionId !== undefined) {
      const messageReadback = await readNovuProviderMessages(options, {
        config,
        transactionId: send.dispatch.novuTransactionId,
        subscriberId: send.dispatch.novuSubscriberId ?? novuReadbackSubscriberId(send),
      })
      return notificationDispatchJsonResponse({
        kind: 'ok',
        code: 'notification_novu_already_recorded',
        dispatchId: send.dispatch.dispatchId,
        dispatchStatus: send.dispatch.status,
        novuTransactionId: send.dispatch.novuTransactionId,
        ...(send.dispatch.novuWorkflowId === undefined ? {} : { novuWorkflowId: send.dispatch.novuWorkflowId }),
        ...(send.dispatch.novuMessageId === undefined ? {} : { novuMessageId: send.dispatch.novuMessageId }),
        ...(send.dispatch.novuSubscriberId === undefined ? {} : { novuSubscriberId: send.dispatch.novuSubscriberId }),
        readbackProviderResponseHash: messageReadback.providerResponseHash,
        novuMessageCount: messageReadback.messages.length,
        businessSlug: send.business.slug,
      })
    }

    const subscriberResult = await novuSubscriberForDispatch(send, env, options)
    if (subscriberResult.kind === 'error') {
      return await recordHeldNovuDispatch({
        options,
        send,
        systemKey,
        redactedError: subscriberResult.error.code,
      })
    }
    const subscriber = subscriberResult.subscriber

    const triggerResult = await (options.triggerInquiry ?? options.triggerOwnerInquiry ?? defaultTriggerInquiry)({
      config,
      recipientRole: send.dispatch.recipientRole,
      subscriber,
      dispatch: {
        dispatchId: send.dispatch.dispatchId,
        providerIdempotencyKey: send.dispatch.providerIdempotencyKey,
        inquiryThreadId: send.dispatch.inquiryThreadId,
        inquiryMessageId: send.dispatch.inquiryMessageId,
        businessName: send.business.name,
        businessSlug: send.business.slug,
        ...(send.inquiry?.customerAccessKey === undefined ? {} : { customerAccessKey: send.inquiry.customerAccessKey }),
      },
      appBaseUrl: new URL(request.url).origin,
    })
    const messageReadback = await readNovuProviderMessages(options, {
      config,
      transactionId: triggerResult.novuTransactionId,
      subscriberId: triggerResult.novuSubscriberId,
    })
    const providerResult = mapNovuReadbackToProviderResult(triggerResult, messageReadback)
    const record = await (options.recordDispatch ?? defaultRecordDispatch)({
      dispatchId: send.dispatch.dispatchId,
      systemKey,
      providerResult,
      operationKey: `notification:dispatch:novu:${send.dispatch.dispatchId}`,
      correlationId: `correlation:notification:dispatch:novu:${send.dispatch.dispatchId}`,
    })
    if (record.kind === 'error') {
      return notificationDispatchJsonResponse(record, { status: statusForNotificationRuntimeError(record.code) })
    }

    return notificationDispatchJsonResponse({
      kind: 'ok',
      code: 'notification_novu_triggered',
      dispatchId: record.dispatch.dispatchId,
      dispatchStatus: record.dispatch.status,
      novuTransactionId: triggerResult.novuTransactionId,
      novuWorkflowId: triggerResult.novuWorkflowId,
      ...(triggerResult.novuMessageId === undefined ? {} : { novuMessageId: triggerResult.novuMessageId }),
      novuSubscriberId: triggerResult.novuSubscriberId,
      ...(providerResult.providerResponseHash === undefined ? {} : { providerResponseHash: providerResult.providerResponseHash }),
      readbackProviderResponseHash: messageReadback.providerResponseHash,
      novuMessageCount: messageReadback.messages.length,
      businessSlug: send.business.slug,
    })
  } catch (error) {
    if (error instanceof NotificationProviderError || error instanceof ConvexSourceError) {
      return notificationDispatchJsonResponse(
        { kind: 'error', code: error.code, retryable: false, reason: error.message },
        { status: error.status }
      )
    }

    throw error
  }
}

async function defaultReadDispatchForSend(
  args: NotificationSystemSendReadArgs
): Promise<NotificationSystemSendReadResult> {
  return await callPublicSourceQuery(readDispatchForSendQuery, args)
}

async function defaultTriggerInquiry(input: SendInquiryNovuInput): Promise<NovuProviderTriggerResult> {
  return await triggerInquiryNovuWorkflow(input)
}

async function readNovuProviderMessages(
  options: NovuDispatchHandlerOptions,
  input: ReadNovuTransactionMessagesInput
): Promise<NovuTransactionMessageReadback> {
  return await (options.readNovuMessages ?? readNovuTransactionMessages)(input)
}

async function defaultRecordDispatch(args: NotificationRecordDispatchArgs): Promise<NotificationRecordDispatchResult> {
  return await callPublicSourceMutation(recordDispatchMutation, args)
}

function readNovuConfig(env: Env): { kind: 'ok'; config: NovuClientConfig } | { kind: 'error'; error: NotificationProviderError } {
  try {
    return { kind: 'ok', config: readNovuClientConfig(env) }
  } catch (error) {
    if (error instanceof NotificationProviderError) {
      return { kind: 'error', error }
    }
    throw error
  }
}

async function novuSubscriberForDispatch(
  send: NotificationSystemSend,
  env: Env,
  options: NovuDispatchHandlerOptions
): Promise<{ kind: 'ok'; subscriber: NovuSubscriberProfile } | { kind: 'error'; error: NotificationProviderError }> {
  try {
    if (send.dispatch.recipientRole === 'customer') {
      return { kind: 'ok', subscriber: customerNovuSubscriberProfile(send.dispatch.inquiryThreadId) }
    }

    const deliveryAddress = await (options.resolveOwnerDeliveryAddress ?? defaultResolveOwnerDeliveryAddress)({
      clerkUserId: send.owner.clerkUserId,
      secretKey: readClerkSecretKey(env),
    })
    return { kind: 'ok', subscriber: ownerNovuSubscriberProfile(send.owner.clerkUserId, deliveryAddress.email) }
  } catch (error) {
    if (error instanceof NotificationProviderError) {
      return { kind: 'error', error }
    }
    throw error
  }
}

function novuReadbackSubscriberId(send: NotificationSystemSend): string {
  return send.dispatch.recipientRole === 'customer'
    ? customerNovuSubscriberProfile(send.dispatch.inquiryThreadId).subscriberId
    : ownerNovuSubscriberProfile(send.owner.clerkUserId).subscriberId
}

async function defaultResolveOwnerDeliveryAddress(input: {
  clerkUserId: string
  secretKey: string
}): Promise<ClerkOwnerDeliveryAddress> {
  return await resolveClerkOwnerDeliveryAddress(input)
}

async function recordHeldNovuDispatch(input: {
  options: NovuDispatchHandlerOptions
  send: NotificationSystemSend
  systemKey: string
  redactedError: string
}): Promise<Response> {
  console.warn(`Novu notification dispatch held: ${input.redactedError}`)
  const record = await (input.options.recordDispatch ?? defaultRecordDispatch)({
    dispatchId: input.send.dispatch.dispatchId,
    systemKey: input.systemKey,
    providerResult: {
      kind: 'error',
      status: 'orchestrator_missing',
      redactedError: input.redactedError,
    },
    operationKey: `notification:dispatch:novu:${input.send.dispatch.dispatchId}`,
    correlationId: `correlation:notification:dispatch:novu:${input.send.dispatch.dispatchId}`,
  })
  if (record.kind === 'error') {
    return notificationDispatchJsonResponse(record, { status: statusForNotificationRuntimeError(record.code) })
  }

  return notificationDispatchJsonResponse({
    kind: 'ok',
    code: 'notification_novu_held',
    dispatchId: record.dispatch.dispatchId,
    dispatchStatus: record.dispatch.status,
    redactedError: input.redactedError,
    businessSlug: input.send.business.slug,
  })
}


function requireDispatchAuthorization(headers: Headers, systemKey: string): void {
  const authorization = headers.get('authorization')?.trim()
  if (authorization !== `Bearer ${systemKey}`) {
    throw new NotificationProviderError(
      'notification_dispatch_unauthorized',
      'Notification dispatch route requires a valid server bearer token.',
      401
    )
  }
}

async function readDispatchId(request: Request): Promise<string> {
  const boundedBody = await readBoundedRequestText(request, MAX_NOTIFICATION_DISPATCH_BODY_BYTES)
  if (!boundedBody.ok) {
    throw new NotificationProviderError(
      'invalid_notification_dispatch_payload',
      'Notification dispatch request body is too large.',
      413,
    )
  }

  try {
    const body = JSON.parse(boundedBody.text) as unknown
    if (isRecord(body) && typeof body.dispatchId === 'string' && body.dispatchId.trim().length > 0) {
      return body.dispatchId.trim()
    }
  } catch {
    // Handled below.
  }

  throw new NotificationProviderError(
    'invalid_notification_dispatch_payload',
    'Notification dispatch request body must include dispatchId.',
    400
  )
}

function notificationDispatchJsonResponse(body: NotificationNovuDispatchResponse, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}

function statusForNotificationRuntimeError(code: string): number {
  if (code === 'notification_not_found' || code === 'owner_not_found') return 404
  if (code === 'notification_system_denied') return 403
  if (code === 'notification_terminal' || code === 'notification_provider_mismatch') return 409
  return 500
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
