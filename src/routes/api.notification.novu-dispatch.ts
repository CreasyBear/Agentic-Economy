import { createFileRoute } from '@tanstack/react-router'

import { kindForStatus } from '@/lib/errors'
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
import { problem } from '@/lib/server/problem'
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
import type {
  NotificationDispatchProviderFailure,
  NotificationRecordDispatchArgs,
  NotificationRecordDispatchResult,
  NotificationRuntimeErrorResult,
  NotificationSystemSend,
  NotificationSystemSendReadArgs,
  NotificationSystemSendReadResult,
} from '@/lib/server/notification-dispatch'
import { readDispatchId, requireDispatchAuthorization } from '@/modules/notification-outbox/public'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/notification/novu-dispatch')({
  server: {
    handlers: {
      POST: ({ request }) => handleNovuDispatchRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

type Env = Record<string, string | undefined>

type NotificationDispatchProviderResult =
  | NovuProviderDispatchResult
  | NotificationDispatchProviderFailure<'provider_missing' | 'orchestrator_missing'>

type NovuDispatchHandlerOptions = {
  env?: Env
  readDispatchForSend?: (args: NotificationSystemSendReadArgs) => Promise<NotificationSystemSendReadResult>
  triggerInquiry?: (input: SendInquiryNovuInput) => Promise<NovuProviderTriggerResult>
  triggerOwnerInquiry?: (input: SendInquiryNovuInput) => Promise<NovuProviderTriggerResult>
  readNovuMessages?: (input: ReadNovuTransactionMessagesInput) => Promise<NovuTransactionMessageReadback>
  resolveOwnerDeliveryAddress?: (input: { clerkUserId: string; secretKey: string }) => Promise<ClerkOwnerDeliveryAddress>
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
      return runtimeErrorResponse(readback)
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
      }, 200)
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
      },
      appBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
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
      return runtimeErrorResponse(record)
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

async function defaultTriggerInquiry(input: SendInquiryNovuInput): Promise<NovuProviderTriggerResult> {
  return await triggerInquiryNovuWorkflow(input)
}

async function readNovuProviderMessages(
  options: NovuDispatchHandlerOptions,
  input: ReadNovuTransactionMessagesInput
): Promise<NovuTransactionMessageReadback> {
  return await (options.readNovuMessages ?? readNovuTransactionMessages)(input)
}

async function defaultRecordDispatch(
  args: NotificationRecordDispatchArgs<NotificationDispatchProviderResult>
): Promise<NotificationRecordDispatchResult> {
  return await callPublicSourceMutation(recordDispatchMutation, args)
}

function runtimeErrorResponse(error: NotificationRuntimeErrorResult): Response {
  const status = statusForNotificationRuntimeError(error.code)
  return problem({
    status,
    kind: kindForStatus(status),
    code: error.code,
    detail: error.reason,
    retryable: error.retryable,
  })
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
    return runtimeErrorResponse(record)
  }

  return notificationDispatchJsonResponse({
    kind: 'ok',
    code: 'notification_novu_held',
    dispatchId: record.dispatch.dispatchId,
    dispatchStatus: record.dispatch.status,
    redactedError: input.redactedError,
    businessSlug: input.send.business.slug,
  }, 200)
}

