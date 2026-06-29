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
  readClerkSecretKey,
  readNotificationOutboxSystemKey,
  readResendClientConfig,
  resolveClerkOwnerDeliveryAddress,
  sendOwnerInquiryResendEmail,
} from '@/lib/server/notification-provider'
import type {
  ClerkOwnerDeliveryAddress,
  ResendProviderSendResult,
  SendOwnerInquiryResendEmailInput,
} from '@/lib/server/notification-provider'

export const Route = createFileRoute('/api/notification/resend-dispatch')({
  server: {
    handlers: {
      POST: ({ request }) => handleResendDispatchRequest(request),
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
  resendMessageId?: string
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

type NotificationRuntimeErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
}

type NotificationDispatchProviderResult =
  | ResendProviderSendResult
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

type NotificationResendDispatchResponse =
  | {
      kind: 'ok'
      code: 'notification_resend_dispatched' | 'notification_resend_already_recorded'
      dispatchId: string
      dispatchStatus: string
      resendMessageId?: string
      providerResponseHash?: string
      ownerAddressHash?: string
      businessSlug: string
    }
  | NotificationRuntimeErrorResult

type ResendDispatchHandlerOptions = {
  env?: Env
  readDispatchForSend?: (args: NotificationSystemSendReadArgs) => Promise<NotificationSystemSendReadResult>
  resolveOwnerDeliveryAddress?: (input: { clerkUserId: string; secretKey: string }) => Promise<ClerkOwnerDeliveryAddress>
  sendOwnerInquiry?: (input: SendOwnerInquiryResendEmailInput) => Promise<ResendProviderSendResult>
  recordDispatch?: (args: NotificationRecordDispatchArgs) => Promise<NotificationRecordDispatchResult>
}

const readDispatchForSendQuery = sourceQuery<NotificationSystemSendReadArgs, NotificationSystemSendReadResult>(
  'notificationOutbox:readNotificationDispatchForSystemSend'
)
const recordDispatchMutation = sourceMutation<NotificationRecordDispatchArgs, NotificationRecordDispatchResult>(
  'notificationOutbox:dispatchNotificationOutbox'
)

export async function handleResendDispatchRequest(
  request: Request,
  options: ResendDispatchHandlerOptions = {}
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
    if (send.dispatch.providerFamily !== 'resend' || send.dispatch.recipientRole !== 'owner') {
      throw new NotificationProviderError(
        'unsupported_notification_dispatch',
        'Only owner Resend notification dispatches can use this route.',
        422
      )
    }
    if (send.dispatch.status === 'sent' || send.dispatch.status === 'delivered' || send.dispatch.resendMessageId !== undefined) {
      return notificationDispatchJsonResponse({
        kind: 'ok',
        code: 'notification_resend_already_recorded',
        dispatchId: send.dispatch.dispatchId,
        dispatchStatus: send.dispatch.status,
        ...(send.dispatch.resendMessageId === undefined ? {} : { resendMessageId: send.dispatch.resendMessageId }),
        businessSlug: send.business.slug,
      })
    }

    const deliveryAddress = await (options.resolveOwnerDeliveryAddress ?? defaultResolveOwnerDeliveryAddress)({
      clerkUserId: send.owner.clerkUserId,
      secretKey: readClerkSecretKey(env),
    })
    const providerResult = await (options.sendOwnerInquiry ?? defaultSendOwnerInquiry)({
      config: readResendClientConfig(env),
      ownerEmail: deliveryAddress.email,
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
      operationKey: `notification:dispatch:resend:${send.dispatch.dispatchId}`,
      correlationId: `correlation:notification:dispatch:resend:${send.dispatch.dispatchId}`,
    })
    if (record.kind === 'error') {
      return notificationDispatchJsonResponse(record, { status: statusForNotificationRuntimeError(record.code) })
    }

    return notificationDispatchJsonResponse({
      kind: 'ok',
      code: 'notification_resend_dispatched',
      dispatchId: record.dispatch.dispatchId,
      dispatchStatus: record.dispatch.status,
      ...(record.dispatch.resendMessageId === undefined ? {} : { resendMessageId: record.dispatch.resendMessageId }),
      providerResponseHash: providerResult.providerResponseHash,
      ownerAddressHash: deliveryAddress.addressHash,
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

async function defaultResolveOwnerDeliveryAddress(input: {
  clerkUserId: string
  secretKey: string
}): Promise<ClerkOwnerDeliveryAddress> {
  return await resolveClerkOwnerDeliveryAddress(input)
}

async function defaultSendOwnerInquiry(input: SendOwnerInquiryResendEmailInput): Promise<ResendProviderSendResult> {
  return await sendOwnerInquiryResendEmail(input)
}

async function defaultRecordDispatch(args: NotificationRecordDispatchArgs): Promise<NotificationRecordDispatchResult> {
  return await callPublicSourceMutation(recordDispatchMutation, args)
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

function notificationDispatchJsonResponse(body: NotificationResendDispatchResponse, init: ResponseInit = {}): Response {
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
