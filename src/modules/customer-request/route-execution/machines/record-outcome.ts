import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { JournalMutationPorts } from './ports'
import type { OutcomeCommand, OutcomeResult } from './types'

export async function recordOutcome(
  args: OutcomeCommand,
  ports: JournalMutationPorts,
): Promise<OutcomeResult> {
  const now = ports.now()
  const attempt = await ports.loadAttemptByRef(args.attemptRef)
  if (attempt === null || attempt.operationKeyDigest !== args.operationKeyDigest) {
    return { kind: 'refused', reason: 'attempt_not_current' }
  }
  const run = await ports.loadRunByRunRef(attempt.runRef)
  if (run === null) throw new Error('customer_request_route_run_integrity_failure')
  if (attempt.state === 'succeeded') {
    return await ports.loadSucceededReplay({
      attemptRef: attempt.attemptRef,
      runRef: run.runRef,
      runState: run.state,
    })
  }
  if (attempt.state !== 'accepted' && attempt.state !== 'dispatched') {
    return { kind: 'refused', reason: 'attempt_not_current' }
  }
  const observation = args.observationJson === undefined
    ? undefined
    : parseRouteTransportObservationJson(args.observationJson)
  if (args.observationJson !== undefined && (observation === undefined
    || (args.outcome.kind === 'succeeded' && observation.disposition !== 'succeeded')
    || (args.outcome.kind === 'partial' && observation.disposition !== 'partial')
    || (args.outcome.kind === 'failed' && observation.disposition !== 'refused')
    || (args.outcome.kind === 'unknown'
      && observation.disposition !== 'unknown' && observation.disposition !== 'partial')
    || !observation.releaseStarted)) {
    return { kind: 'refused', reason: 'output_invalid' }
  }
  const observationPatch = observation === undefined ? {} : {
    transportObservationJson: args.observationJson,
    transportObservationDigest: canonicalDigest(observation),
  }
  if (args.outcome.kind === 'partial') {
    const suppliedOutput = parseBoundedJson(args.outcome.outputJson)
    const validated = suppliedOutput === undefined
      ? null
      : await ports.validateAttemptOutput(attempt.attemptRef, suppliedOutput)
    return await ports.commitPartialOutcome({
      attemptRef: attempt.attemptRef,
      runRef: run.runRef,
      now,
      observationPatch,
      validated,
    })
  }
  if (args.outcome.kind === 'unknown') {
    return await ports.commitUnknownOutcome({
      attemptRef: attempt.attemptRef,
      runRef: run.runRef,
      now,
      observationPatch,
    })
  }
  if (args.outcome.kind === 'failed') {
    return await ports.commitFailedOutcome({
      attemptRef: attempt.attemptRef,
      runRef: run.runRef,
      now,
      observationPatch,
    })
  }
  const suppliedOutput = parseBoundedJson(args.outcome.outputJson)
  const validated = suppliedOutput === undefined
    ? null
    : await ports.validateAttemptOutput(attempt.attemptRef, suppliedOutput)
  if (validated === null) {
    return await ports.commitUnknownOutcome({
      attemptRef: attempt.attemptRef,
      runRef: run.runRef,
      now,
      observationPatch: {},
    })
  }
  return await ports.commitSucceededOutcome({
    attemptRef: attempt.attemptRef,
    runRef: run.runRef,
    now,
    validated,
    observationPatch,
  })
}

function parseBoundedJson(value: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
