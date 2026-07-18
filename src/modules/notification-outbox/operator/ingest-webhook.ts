import { brandNonEmpty } from '@/modules/common/ids'

import { ingestNotificationWebhook } from '../internal/commands'
import { parseRedactedPayload } from './parse-payload'
import type { NotificationOutboxOperatorPorts } from './ports'
import { resolveWebhookDispatchId } from './resolve-webhook-dispatch'
import { serializeDispatch, serializeWebhookEvent } from './serialize'
import type { IngestWebhookArgs, IngestWebhookResult } from './types'

export async function ingestWebhook(
  args: IngestWebhookArgs,
  ports: NotificationOutboxOperatorPorts,
): Promise<IngestWebhookResult> {
  const state = await ports.loadSourceState()
  const resolvedDispatchId = args.dispatchId ?? resolveWebhookDispatchId(state, args)
  const result = ingestNotificationWebhook(state, {
    providerFamily: args.providerFamily,
    providerEventId: args.providerEventId,
    logicalObjectKey: args.logicalObjectKey,
    eventType: args.eventType,
    signatureStatus: args.signatureStatus,
    payloadHash: brandNonEmpty(args.payloadHash, 'SourceHash'),
    redactedPayload: parseRedactedPayload(args.redactedPayloadJson),
    ...(resolvedDispatchId === undefined
      ? {}
      : { dispatchId: brandNonEmpty(resolvedDispatchId, 'NotificationDispatchId') }),
    operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
    receivedAt: ports.now(),
  })

  if (result.kind === 'error') {
    return {
      kind: 'error' as const,
      code: result.code,
      retryable: result.retryable,
      reason: result.reason,
    }
  }

  await ports.persistSourceState(result.state)
  await ports.recordReconstruction({
    code: result.code,
    webhookEvent: result.webhookEvent,
    ...(result.dispatch === undefined ? {} : { dispatch: result.dispatch }),
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    actorKind: 'system',
    actorRef: 'system:notification-webhook',
  })
  return {
    kind: 'ok' as const,
    code: result.code,
    webhookEvent: serializeWebhookEvent(result.webhookEvent),
    ...(result.dispatch === undefined ? {} : { dispatch: serializeDispatch(result.dispatch) }),
  }
}
