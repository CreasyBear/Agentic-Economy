import { createFileRoute } from '@tanstack/react-router'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import { kindForStatus } from '@/lib/errors'
import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { notificationErrorResponse } from '@/lib/server/notification-dispatch'
import type { NotificationRuntimeErrorResult } from '@/lib/server/notification-dispatch'
import { response as notificationWebhookJsonResponse } from '@/lib/server/no-store-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import {
  NotificationProviderError,
  readNotificationOutboxSystemKey,
  readResendWebhookSecret,
  verifyResendWebhook,
} from '@/lib/server/notification-provider'
import type { ResendVerifiedWebhook } from '@/lib/server/notification-provider'

const MAX_RESEND_WEBHOOK_BODY_BYTES = 256 * 1024

export const Route = createFileRoute('/api/notification/resend-webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleResendWebhookRequest(request),
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

type NotificationWebhookIngestArgs = ResendVerifiedWebhook & {
  signatureStatus: 'verified'
  systemKey: string
  operationKey: string
  correlationId: string
}

type NotificationWebhookIngestResult =
  | {
      kind: 'ok'
      code:
        | 'notification_webhook_received'
        | 'notification_webhook_duplicate'
        | 'notification_webhook_rejected'
        | 'notification_webhook_held'
    }
  | NotificationRuntimeErrorResult

type ResendWebhookHandlerOptions = {
  env?: Env
  now?: number
  ingestWebhook?: (args: NotificationWebhookIngestArgs) => Promise<NotificationWebhookIngestResult>
}

const ingestNotificationWebhookEvent = sourceMutation<NotificationWebhookIngestArgs, NotificationWebhookIngestResult>(
  'notificationOutbox:ingestNotificationWebhookEvent'
)

export async function handleResendWebhookRequest(
  request: Request,
  options: ResendWebhookHandlerOptions = {}
): Promise<Response> {
  try {
    const env = options.env ?? process.env
    const boundedBody = await readBoundedRequestText(request, MAX_RESEND_WEBHOOK_BODY_BYTES)
    if (!boundedBody.ok) {
      throw new NotificationProviderError(
        'invalid_resend_webhook_payload',
        'Resend webhook payload is too large.',
        413,
      )
    }
    const verified = await verifyResendWebhook({
      rawBody: boundedBody.text,
      headers: request.headers,
      secret: readResendWebhookSecret(env),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
    const ingestArgs: NotificationWebhookIngestArgs = {
      ...verified,
      signatureStatus: 'verified',
      systemKey: readNotificationOutboxSystemKey(env),
      operationKey: `notification:webhook:resend:${verified.providerEventId}`,
      correlationId: `correlation:notification:webhook:resend:${verified.providerEventId}`,
    }
    const result = await (options.ingestWebhook ?? defaultIngestWebhook)(ingestArgs)

    if (result.kind !== 'ok') {
      return problem({
        status: 500,
        kind: kindForStatus(500),
        code: result.code,
        detail: result.reason,
        retryable: result.retryable,
      })
    }
    return notificationWebhookJsonResponse(result, 200)
  } catch (error) {
    const normalizedError = notificationErrorResponse(error)
    if (normalizedError !== undefined) return normalizedError
    throw error
  }
}

async function defaultIngestWebhook(args: NotificationWebhookIngestArgs): Promise<NotificationWebhookIngestResult> {
  return await callPublicSourceMutation(ingestNotificationWebhookEvent, args)
}

