import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { NotificationProviderError } from '@/lib/server/notification-provider'

export const MAX_NOTIFICATION_DISPATCH_BODY_BYTES = 4 * 1024

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
