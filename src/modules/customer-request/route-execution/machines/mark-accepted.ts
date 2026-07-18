import type { DispatchLifecyclePorts } from './dispatch-lifecycle-ports'
import type { MarkAcceptedCommand, MarkAcceptedResult } from './types'

export async function markAccepted(
  args: MarkAcceptedCommand,
  ports: DispatchLifecyclePorts,
): Promise<MarkAcceptedResult> {
  const attempt = await ports.loadAttemptByRef(args.attemptRef)
  if (attempt === null || attempt.operationKeyDigest !== args.operationKeyDigest) {
    return { kind: 'refused', reason: 'attempt_not_current' }
  }
  if (attempt.state === 'accepted' || attempt.state === 'succeeded') return { kind: 'replayed' }
  if (attempt.state !== 'dispatched') {
    return { kind: 'refused', reason: 'attempt_not_current' }
  }
  return await ports.commitMarkAccepted({
    attemptRef: attempt.attemptRef,
    now: ports.now(),
  })
}
