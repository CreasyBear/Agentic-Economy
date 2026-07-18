import { brandNonEmpty } from '@/modules/common/ids'

import { retryNotificationDispatch } from '../internal/commands'
import type { NotificationOutboxOperatorPorts } from './ports'
import { serializeDispatch } from './serialize'
import type { RetryDispatchArgs, RetryDispatchResult } from './types'

export async function retryDispatch(
  args: RetryDispatchArgs,
  ports: NotificationOutboxOperatorPorts,
): Promise<RetryDispatchResult> {
  const [state, authority] = await Promise.all([
    ports.loadSourceState(),
    ports.readOperatorAuthority(),
  ])
  const result = retryNotificationDispatch(state, {
    ...(authority === undefined ? {} : { authority }),
    dispatchId: brandNonEmpty(args.dispatchId, 'NotificationDispatchId'),
    operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
    retryAfter: args.retryAfter,
    now: ports.now(),
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
    dispatch: result.dispatch,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    actorKind: 'admin',
    actorRef: authority?.actorRef ?? 'admin:missing',
  })
  return {
    kind: 'ok' as const,
    code: result.code,
    dispatch: serializeDispatch(result.dispatch),
  }
}
