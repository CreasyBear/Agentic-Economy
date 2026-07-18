import type { NotificationOutboxSourceState } from '../internal/schema'

export function resolveWebhookDispatchId(
  state: NotificationOutboxSourceState,
  args: Readonly<{ logicalObjectKey: string; providerEventId: string }>,
): string | undefined {
  return state.dispatches.find((dispatch) =>
    dispatch.dispatchId === args.logicalObjectKey
    || dispatch.providerIdempotencyKey === args.logicalObjectKey
    || dispatch.resendMessageId === args.logicalObjectKey
    || dispatch.novuTransactionId === args.logicalObjectKey
    || dispatch.novuWorkflowId === args.logicalObjectKey
    || dispatch.novuMessageId === args.logicalObjectKey
    || dispatch.novuSubscriberId === args.logicalObjectKey
    || dispatch.dispatchId === args.providerEventId
    || dispatch.providerIdempotencyKey === args.providerEventId
  )?.dispatchId
}
