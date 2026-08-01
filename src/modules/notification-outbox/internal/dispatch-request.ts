import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { NotificationProviderError } from '@/lib/server/notification-provider'
import { z } from 'zod'

export const MAX_NOTIFICATION_DISPATCH_BODY_BYTES = 4 * 1024
const dispatchBodySchema = z.object({
  dispatchId: z.string().trim().min(1),
})

export function requireDispatchAuthorization(headers: Headers, systemKey: string): void {
  const authorization = headers.get('authorization')?.trim()
  if (authorization !== `Bearer ${systemKey}`) {
    throw new NotificationProviderError(
      'notification_dispatch_unauthorized',
      'Notification dispatch route requires a valid server bearer token.',
      401
    )
  }
}

export async function readDispatchId(request: Request): Promise<string> {
  const boundedBody = await readBoundedRequestText(request, MAX_NOTIFICATION_DISPATCH_BODY_BYTES)
  if (!boundedBody.ok) {
    throw new NotificationProviderError(
      'invalid_notification_dispatch_payload',
      'Notification dispatch request body is too large.',
      413,
    )
  }

  try {
    const parsed = dispatchBodySchema.safeParse(JSON.parse(boundedBody.text))
    if (parsed.success) return parsed.data.dispatchId
  } catch {
    // Handled below.
  }

  throw new NotificationProviderError(
    'invalid_notification_dispatch_payload',
    'Notification dispatch request body must include dispatchId.',
    400
  )
}

