import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  canPreReleaseCancel,
  canRequestAdapterCancellation,
  cancelCommandArgsConflict,
  cancelDisposition,
  cancelPriorCommandConflicts,
  cancelRunHeadIntegrityValid,
  cancelRunNotFound,
} from '../journal/decisions'

import type { CancelMutationPorts } from './cancel-ports'
import type { CancelCommand, CancelResult } from './types'

export async function cancelCurrent(
  args: CancelCommand,
  ports: CancelMutationPorts,
): Promise<CancelResult> {
  const now = ports.now()
  if (cancelCommandArgsConflict(args)) {
    return { kind: 'conflict', reason: 'command_changed' }
  }
  const commandKey = `route-cancel-command:v1:${canonicalDigest({
    principalId: args.principalId, requestId: args.requestId, idempotencyKey: args.idempotencyKey,
  })}`
  const commandDigest = canonicalDigest(args)
  const prior = await ports.loadPriorCancelCommand(commandKey)
  if (prior !== null) {
    const historicalDefaultDigest = canonicalDigest({
      requestId: args.requestId,
      principalId: args.principalId,
      idempotencyKey: args.idempotencyKey,
    })
    if (cancelPriorCommandConflicts({
      prior, args, commandDigest, historicalDefaultDigest,
    })) {
      return { kind: 'conflict', reason: 'command_changed' }
    }
    return await ports.commitCancelCommandReplay(prior.runRef, prior.result)
  }
  const head = await ports.loadRunHead(args.requestId)
  if (cancelRunNotFound(head, args.principalId) || head === null) {
    return { kind: 'refused', reason: 'run_not_found' }
  }
  const run = await ports.loadRunByRef(head.currentRunRef)
  if (!cancelRunHeadIntegrityValid(run, head) || run === null) {
    throw new Error('customer_request_route_run_head_integrity_failure')
  }
  const attempt = await ports.loadAttemptAtPosition(run.runRef, run.currentPosition)
  if (attempt === null) throw new Error('customer_request_route_run_attempt_integrity_failure')
  const outbox = await ports.loadDispatchByAttemptRef(attempt.attemptRef)
  if (outbox === null) throw new Error('customer_request_route_dispatch_integrity_failure')
  const canCancel = canPreReleaseCancel({
    attemptState: attempt.state, outboxState: outbox.state,
  })
  const canRequestCancel = canRequestAdapterCancellation({
    canPreReleaseCancel: canCancel,
    mode: args.mode,
    attemptState: attempt.state,
    cancellationKind: attempt.grant.step.cancellation.kind,
  })
  const commandResult = cancelDisposition({
    canPreReleaseCancel: canCancel,
    canRequestAdapterCancellation: canRequestCancel,
  })
  const commandInput = {
    commandKey,
    commandDigest,
    principalId: args.principalId,
    requestId: args.requestId,
    runRef: run.runRef,
    mode: args.mode,
    result: commandResult,
    boundaryChangedAt: run.updatedAt,
    now,
  }
  if (canCancel) {
    return await ports.commitPreReleaseCancel({
      ...commandInput,
      attemptRef: attempt.attemptRef,
    })
  }
  if (canRequestCancel) {
    const cancellationRef = `route-cancellation:v1:${canonicalDigest({
      runRef: run.runRef,
      attemptRef: attempt.attemptRef,
      operationKeyDigest: attempt.operationKeyDigest,
    })}`
    return await ports.commitPendingAdapterCancellation({
      ...commandInput,
      attemptRef: attempt.attemptRef,
      operationKeyDigest: attempt.operationKeyDigest,
      cancellationRef,
    })
  }
  return await ports.commitCancelDispositionOnly(commandInput)
}
