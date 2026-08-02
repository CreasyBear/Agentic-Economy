import { ConvexSourceError } from '@/lib/server/convex-source'
import { response } from '@/lib/server/no-store-response'
import { NotificationProviderError } from '@/lib/server/notification-provider'
import type {
  NotificationAttemptStatus,
  NotificationDispatchStatus,
} from '@/modules/notification-outbox/public'

export type NotificationDispatchProjection = {
  dispatchId: string
  businessId: string
  inquiryThreadId: string
  inquiryMessageId: string
  recipientRole: 'owner' | 'customer'
  providerFamily: 'resend' | 'novu'
  status: NotificationDispatchStatus
  providerIdempotencyKey: string
  payloadHash: string
  resendMessageId?: string
  novuTransactionId?: string
  novuWorkflowId?: string
  novuMessageId?: string
  novuSubscriberId?: string
  providerMissing: boolean
  orchestratorMissing: boolean
  retryCount: number
  retryAfter?: number
  lastRedactedError?: string
  operationKey: string
  correlationId: string
  createdAt: number
  updatedAt: number
}

export type NotificationRuntimeErrorResult = {
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
}

export type NotificationSystemSendReadArgs = {
  dispatchId: string
  systemKey: string
}

export type NotificationSystemSend = {
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
    offeringName?: string
    customerMessageFirstLine?: string
    isFirstInquiryForBusiness: boolean
  }
}

export type NotificationSystemSendReadResult =
  | {
      kind: 'ok'
      code: 'notification_dispatch_send_read'
      send: NotificationSystemSend
    }
  | NotificationRuntimeErrorResult

export type NotificationDispatchProviderFailureStatus =
  | 'failed'
  | 'provider_missing'
  | 'orchestrator_missing'

export type NotificationDispatchProviderFailure<
  Status extends NotificationDispatchProviderFailureStatus = NotificationDispatchProviderFailureStatus
> = {
  kind: 'error'
  status: Status
  redactedError: string
  retryAfter?: number
  providerResponseHash?: string
}

export type NotificationRecordDispatchArgs<ProviderResult> = {
  dispatchId: string
  systemKey: string
  providerResult: ProviderResult
  operationKey: string
  correlationId: string
}

export type NotificationRecordDispatchResult =
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

export function notificationErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof NotificationProviderError || error instanceof ConvexSourceError)) {
    return undefined
  }

  return response({ kind: 'error', code: error.code, retryable: false, reason: error.message }, error.status)
}

export function statusForNotificationRuntimeError(code: string): number {
  if (code === 'notification_not_found' || code === 'owner_not_found') return 404
  if (code === 'notification_system_denied') return 403
  if (code === 'notification_terminal' || code === 'notification_provider_mismatch') return 409
  return 500
}
