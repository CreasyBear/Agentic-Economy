import { brandNonEmpty } from '@/modules/common/ids'

import { markNotificationNoRepair } from '../internal/commands'
import type { NotificationOutboxOperatorPorts } from './ports'
import { serializeDispatch } from './serialize'
import type { MarkNoRepairArgs, MarkNoRepairResult } from './types'

export async function markNoRepair(
  args: MarkNoRepairArgs,
  ports: NotificationOutboxOperatorPorts,
): Promise<MarkNoRepairResult> {
  const [state, authority] = await Promise.all([
    ports.loadSourceState(),
    ports.readOperatorAuthority(),
  ])
  const result = markNotificationNoRepair(state, {
    ...(authority === undefined ? {} : { authority }),
    dispatchId: brandNonEmpty(args.dispatchId, 'NotificationDispatchId'),
    reason: args.reason,
    operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
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
