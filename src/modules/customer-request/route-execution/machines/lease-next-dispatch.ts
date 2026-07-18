import {
  leaseArgsInvalid,
  leaseGrantExpired,
  leasePendingCandidateValid,
} from '../journal'

import type { JournalMutationPorts } from './ports'
import type { LeaseCommand, LeaseResult } from './types'

export const MAX_PENDING_DISPATCH_SCAN = 64

export async function leaseNextDispatch(
  args: LeaseCommand,
  ports: JournalMutationPorts,
): Promise<LeaseResult> {
  const now = ports.now()
  if (leaseArgsInvalid(args)) {
    return { kind: 'refused', reason: 'lease_invalid' }
  }
  const pendingCandidates = await ports.scanPendingDispatches(now)
  for (const pending of pendingCandidates) {
    const attempt = await ports.loadAttemptByRef(pending.attemptRef)
    if (!leasePendingCandidateValid({ attempt, dispatch: pending }) || attempt === null) {
      throw new Error('customer_request_route_dispatch_integrity_failure')
    }
    if (leaseGrantExpired(attempt.grant.expiresAt, now)) {
      await ports.failExpiredUnreleasedAttempt({
        dispatchRef: pending.dispatchRef,
        attemptRef: attempt.attemptRef,
        now,
      })
      continue
    }
    const leaseExpiresAt = now + args.leaseDurationMs
    return await ports.grantDispatchLease({
      dispatchRef: pending.dispatchRef,
      attemptRef: attempt.attemptRef,
      workerId: args.workerId,
      leaseExpiresAt,
      leaseDurationMs: args.leaseDurationMs,
      now,
    })
  }
  if (pendingCandidates.length === MAX_PENDING_DISPATCH_SCAN) {
    await ports.scheduleExpiredDispatchCleanup(now)
  }
  return { kind: 'none' }
}
