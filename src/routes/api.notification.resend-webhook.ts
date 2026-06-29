import { createFileRoute } from '@tanstack/react-router'

import {
  callPublicSourceMutation,
  ConvexSourceError,
  sourceMutation,
} from '@/lib/server/convex-source'
import {
  NotificationProviderError,
  readNotificationOutboxSystemKey,
  readResendWebhookSecret,
  verifyResendWebhook,
} from '@/lib/server/notification-provider'
import type { ResendVerifiedWebhook } from '@/lib/server/notification-provider'

export const Route = createFileRoute('/api/notification/resend-webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleResendWebhookRequest(request),
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
  | {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
    }

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
    const verified = verifyResendWebhook({
      rawBody: await request.text(),
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

    return notificationWebhookJsonResponse(result, {
      status: result.kind === 'ok' ? 200 : 500,
    })
  } catch (error) {
    if (error instanceof NotificationProviderError || error instanceof ConvexSourceError) {
      return notificationWebhookJsonResponse(
        { kind: 'error', code: error.code, retryable: false, reason: error.message },
        { status: error.status }
      )
    }

    throw error
  }
}

async function defaultIngestWebhook(args: NotificationWebhookIngestArgs): Promise<NotificationWebhookIngestResult> {
  return await callPublicSourceMutation(ingestNotificationWebhookEvent, args)
}

function notificationWebhookJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  })
}
