import { createFileRoute } from '@tanstack/react-router'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import {
  notificationErrorResponse,
  statusForNotificationRuntimeError,
} from '@/lib/server/notification-dispatch'
import { response as notificationDispatchJsonResponse } from '@/lib/server/no-store-response'
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
import type {
  NotificationDispatchProviderFailure,
  NotificationRecordDispatchArgs,
  NotificationRecordDispatchResult,
  NotificationSystemSendReadArgs,
  NotificationSystemSendReadResult,
} from '@/lib/server/notification-dispatch'
import { readDispatchId, requireDispatchAuthorization } from '@/modules/notification-outbox/public'

export const Route = createFileRoute('/api/notification/resend-dispatch')({
  server: {
    handlers: {
      POST: ({ request }) => handleResendDispatchRequest(request),
    },
  },
})

type Env = Record<string, string | undefined>

type NotificationDispatchProviderResult = ResendProviderSendResult | NotificationDispatchProviderFailure

type ResendDispatchHandlerOptions = {
  env?: Env
  readDispatchForSend?: (args: NotificationSystemSendReadArgs) => Promise<NotificationSystemSendReadResult>
  resolveOwnerDeliveryAddress?: (input: { clerkUserId: string; secretKey: string }) => Promise<ClerkOwnerDeliveryAddress>
  sendOwnerInquiry?: (input: SendOwnerInquiryResendEmailInput) => Promise<ResendProviderSendResult>
  recordDispatch?: (
    args: NotificationRecordDispatchArgs<NotificationDispatchProviderResult>
  ) => Promise<NotificationRecordDispatchResult>
}

const readDispatchForSendQuery = sourceQuery<NotificationSystemSendReadArgs, NotificationSystemSendReadResult>(
  'notificationOutbox:readNotificationDispatchForSystemSend'
)
const recordDispatchMutation = sourceMutation<
  NotificationRecordDispatchArgs<NotificationDispatchProviderResult>,
  NotificationRecordDispatchResult
>('notificationOutbox:dispatchNotificationOutbox')

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
      return notificationDispatchJsonResponse(readback, statusForNotificationRuntimeError(readback.code))
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
      }, 200)
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
        ...(send.inquiry?.offeringName === undefined ? {} : { offeringName: send.inquiry.offeringName }),
        ...(send.inquiry?.customerMessageFirstLine === undefined ? {} : { customerMessageFirstLine: send.inquiry.customerMessageFirstLine }),
        ...(send.inquiry === undefined ? {} : { isFirstInquiryForBusiness: send.inquiry.isFirstInquiryForBusiness }),
      },
      appBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    })
    const record = await (options.recordDispatch ?? defaultRecordDispatch)({
      dispatchId: send.dispatch.dispatchId,
      systemKey,
      providerResult,
      operationKey: `notification:dispatch:resend:${send.dispatch.dispatchId}`,
      correlationId: `correlation:notification:dispatch:resend:${send.dispatch.dispatchId}`,
    })
    if (record.kind === 'error') {
      return notificationDispatchJsonResponse(record, statusForNotificationRuntimeError(record.code))
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
    }, 200)
  } catch (error) {
    const normalizedError = notificationErrorResponse(error)
    if (normalizedError !== undefined) return normalizedError
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

async function defaultRecordDispatch(
  args: NotificationRecordDispatchArgs<NotificationDispatchProviderResult>
): Promise<NotificationRecordDispatchResult> {
  return await callPublicSourceMutation(recordDispatchMutation, args)
}
