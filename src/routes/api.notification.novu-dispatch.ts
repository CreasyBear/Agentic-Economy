import { createFileRoute } from '@tanstack/react-router'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  NotificationProviderError,
  readNotificationOutboxSystemKey,
  readNovuClientConfig,
  readNovuTransactionMessages,
  triggerOwnerInquiryNovuWorkflow,
} from '@/lib/server/notification-provider'
import type {
  NovuClientConfig,
  NovuProviderTriggerResult,
  NovuTransactionMessageReadback,
  ReadNovuTransactionMessagesInput,
  SendOwnerInquiryNovuInput,
} from '@/lib/server/notification-provider'

export const Route = createFileRoute('/api/notification/novu-dispatch')({
  server: {
    handlers: {
      POST: ({ request }) => handleNovuDispatchRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

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
      }
    }
  | NotificationRuntimeErrorResult

type NotificationDispatchProviderResult =
  | NovuProviderTriggerResult
  | {
      kind: 'error'
      status: 'failed' | 'provider_missing' | 'orchestrator_missing'
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
  | NotificationRuntimeErrorResult

type NovuDispatchHandlerOptions = {
  env?: Env
  readDispatchForSend?: (args: NotificationSystemSendReadArgs) => Promise<NotificationSystemSendReadResult>
  triggerOwnerInquiry?: (input: SendOwnerInquiryNovuInput) => Promise<NovuProviderTriggerResult>
  readNovuMessages?: (input: ReadNovuTransactionMessagesInput) => Promise<NovuTransactionMessageReadback>
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
    if (send.dispatch.providerFamily !== 'novu' || send.dispatch.recipientRole !== 'owner') {
      throw new NotificationProviderError(
        'unsupported_notification_dispatch',
        'Only owner Novu notification dispatches can use this route.',
        422
      )
    }

    const config = readNovuClientConfig(env)
    const fallbackSubscriberId = ownerNovuSubscriberId(send.owner.clerkUserId)
    if (send.dispatch.novuTransactionId !== undefined) {
      const messageReadback = await readNovuProviderMessages(options, {
        config,
        transactionId: send.dispatch.novuTransactionId,
        subscriberId: send.dispatch.novuSubscriberId ?? fallbackSubscriberId,
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

    const providerResult = await (options.triggerOwnerInquiry ?? defaultTriggerOwnerInquiry)({
      config,
      subscriberId: fallbackSubscriberId,
      dispatch: {
        dispatchId: send.dispatch.dispatchId,
        providerIdempotencyKey: send.dispatch.providerIdempotencyKey,
        inquiryThreadId: send.dispatch.inquiryThreadId,
        businessName: send.business.name,
        businessSlug: send.business.slug,
      },
      appBaseUrl: new URL(request.url).origin,
    })
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

    const messageReadback = await readNovuProviderMessages(options, {
      config,
      transactionId: providerResult.novuTransactionId,
      subscriberId: providerResult.novuSubscriberId,
    })

    return notificationDispatchJsonResponse({
      kind: 'ok',
      code: 'notification_novu_triggered',
      dispatchId: record.dispatch.dispatchId,
      dispatchStatus: record.dispatch.status,
      novuTransactionId: providerResult.novuTransactionId,
      novuWorkflowId: providerResult.novuWorkflowId,
      ...(providerResult.novuMessageId === undefined ? {} : { novuMessageId: providerResult.novuMessageId }),
      novuSubscriberId: providerResult.novuSubscriberId,
      providerResponseHash: providerResult.providerResponseHash,
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

async function defaultTriggerOwnerInquiry(input: SendOwnerInquiryNovuInput): Promise<NovuProviderTriggerResult> {
  return await triggerOwnerInquiryNovuWorkflow(input)
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

function ownerNovuSubscriberId(clerkUserId: string): string {
  const normalized = clerkUserId.trim()
  if (normalized.length === 0) {
    throw new NotificationProviderError(
      'invalid_novu_trigger_payload',
      'Owner Clerk user id is required for Novu subscriber id.',
      500
    )
  }

  return `owner:${normalized}`
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
  try {
    const body = (await request.json()) as unknown
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
